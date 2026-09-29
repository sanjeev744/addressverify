# AddressVerify — Technical Architecture

AddressVerify validates shipping addresses before an order is placed, suggests corrections, and gives merchants configurable rules, logs, and analytics. AddressHero is used only as a functional reference. No branding, copy, assets, or proprietary implementation from that app are reused.

## 1. Goals and non-goals

**Goals**

- Validate street, house number, city, state/province, postal code, country, PO Boxes, special characters, incomplete/invalid addresses, common typos, and city/postal mismatches.
- Show a short, accessible checkout message with a suggested address and **Use Suggested Address** / **Edit Address**.
- Enforce merchant rules as close to checkout submission as Shopify allows — not via theme JavaScript.
- Keep the validation provider swappable.
- Store activity without exposing names, emails, or phone numbers in the admin UI.

**Non-goals**

- Theme script injection as the primary validation path.
- Hard-coding a single third-party address API into checkout or admin business logic.
- Permanently blocking checkout when the provider is down, unless the merchant enables fail-closed.

## 2. Recommended stack

| Layer | Choice | Why |
| --- | --- | --- |
| App framework | Shopify Remix template (Vite, TypeScript) | Official embedded-app path with OAuth, session storage, App Bridge |
| Admin UI | Shopify Polaris + App Bridge | Matches Shopify Admin and current app-review expectations |
| Database | MySQL `addressverify` via Prisma | Matches the provided XAMPP credentials |
| Checkout UX | Checkout UI Extension | Native banners, address updates, no theme JS |
| Hard enforcement | Cart and Checkout Validation Function | Server-side, works on express wallets |
| Post-order correction | Thank You + Order Status UI extensions | Available on more plans than checkout chrome |
| Auth | Shopify managed OAuth + offline sessions | Required for Admin API, webhooks, GDPR |

## 3. Shopify API and extension plan

### 3.1 Surfaces

```
Customer address
        │
        ▼
Checkout UI Extension  ──fetch──►  Remix /api/checkout/validate
        │                                 │
        │                                 ▼
        │                         Validation Service
        │                                 │
        │                          Provider adapter
        │                           (builtin / HTTP /
        │                            Google / Loqate / Smarty)
        │                                 │
        ▼                                 ▼
Suggested address banner          ValidationLog + result
        │
        ├── Use suggested → applyShippingAddressChange() → re-validate
        └── Edit address  → buyer returns to address fields
        │
        ▼
Cart & Checkout Validation Function (server-side)
        │
        ├── valid / warning → allow checkout
        └── block rule failed → field error, checkout stopped
```

### 3.2 Extensions

| Extension | Targets | Plan coverage | Role |
| --- | --- | --- | --- |
| `address-verify-checkout` | `purchase.checkout.delivery-address.render-after`, `purchase.checkout.block.render` | Checkout Extensibility / Plus for checkout chrome | Suggestions, auto-apply corrections, customer copy |
| `address-verify-checkout` | `purchase.thank-you.block.render`, `customer-account.order-status.block.render` | All modern plans | Post-order correction when checkout UI is unavailable |
| `address-verify-function` | `cart.validations.generate.run` | All plans, including Shop Pay / Apple Pay / Google Pay / PayPal | Deterministic block rules at submission |

`useBuyerJourneyIntercept` is deprecated (July 2026). This app never relies on it to stop checkout.

### 3.3 Admin API usage

- OAuth install and offline session.
- `metafieldsSet` on Shop (`$app:addressverify.config`) so the Function and Checkout UI can read rules without a network call.
- `validationCreate` / `validationUpdate` to activate the Function after install.
- Optional `orderUpdate` when a buyer accepts a correction on the thank-you page.
- Webhooks: `app/uninstalled`, `app/scopes_update`, GDPR compliance topics.

### 3.4 Scopes

`read_orders`, `write_orders`, `read_customers`, `write_validations`, `read_locales`, `write_metaobjects`, `read_metaobjects`

Protected customer data (physical address) is required for checkout validation. The app requests it only for validation, logging (redacted), and optional post-order correction.

### 3.5 Why Functions + UI together

- **Function**: only reliable way to block express checkout and to show field-level errors without checkout JS.
- **UI extension**: only native way to show “Did you mean…?” and write the corrected address back.
- **Function network fetch** is limited to Enterprise custom apps, so provider calls run in the Remix app. The Function enforces local/deterministic rules from metafields. Express checkout therefore still gets PO Box, house-number, special-character, incomplete, and postal-format blocking.

If a rule is `auto_correct` and only the Function runs (wallet checkout), the Function treats that issue as a warning unless `failClosed` or a separate `block` rule also matches.

## 4. Validation service architecture

```
AddressInput
    → ValidationEngine
        1. Normalize
        2. Apply enabled merchant rules (local, deterministic)
        3. Call AddressValidationProvider (interface)
        4. Merge provider suggestion + confidence
        5. Resolve action: allow | warn | auto_correct | block
    → ValidationResult
        → Checkout UI / Test Address / Function metafield sync / Log
```

### 4.1 Provider contract

```ts
interface AddressInput {
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  country: string;
}

interface ValidationResult {
  valid: boolean;
  status: "valid" | "invalid" | "corrected" | "warning" | "unavailable";
  confidence: number;
  errorTypes: ErrorType[];
  suggested?: AddressInput;
  normalized?: AddressInput;
  messageKey?: string;
  provider: string;
}
```

Providers implemented:

- `builtin` — typo dictionary, postal formats, PO Box, house number, special characters, incomplete/invalid, common city corrections.
- `http` — merchant-configured webhook.
- `google` — Google Address Validation API.
- `loqate` — Loqate International.
- `smarty` — Smarty US Street API.

Business logic never imports a concrete provider. A factory selects the adapter from shop settings.

### 4.2 Merchant rule keys

| Key | Default | Default action |
| --- | --- | --- |
| `require_house_number` | on | block |
| `block_po_boxes` | on | block |
| `block_special_characters` | on | warn |
| `validate_postal_code` | on | block |
| `validate_city_postal` | on | warn |
| `validate_street_name` | on | warn |
| `detect_incomplete` | on | block |
| `detect_invalid` | on | block |
| `auto_correct_typos` | on | auto_correct |

Each rule can be disabled or set to **Block checkout**, **Show warning**, or **Automatically correct**.

### 4.3 Fail-open / fail-closed

If the configured provider times out or returns 5xx:

- Default: allow checkout, log `unavailable`, show a short warning only if the UI extension is present.
- Fail-closed enabled: Function and UI treat provider-unavailable as a block using the “service temporarily unavailable” message.

## 5. Database structure (MySQL `addressverify`)

User `root`, empty password, `utf8mb4`.

- **Session** — Shopify offline/online sessions (Prisma session storage).
- **ShopSettings** — enabled flag, fail-closed, provider type/credentials (API key encrypted at rest), Function GIDs, onboarding state.
- **ValidationRule** — per-shop rule + action.
- **ValidationMessage** — configurable customer-facing titles/bodies.
- **ValidationLog** — activity for dashboard/analytics. No name, email, or phone. Optional internal `customerId` / `orderId` for GDPR delete only.

Indexes: `(shop, createdAt)`, `(shop, result)`, `(shop, errorType)`.

## 6. App screens

| Route | Purpose |
| --- | --- |
| `/` | Install / shop-domain entry |
| `/app` | Dashboard: KPIs, success rate, common errors, recent activity, date filter |
| `/app/rules` | Enable rules and set block / warn / auto-correct |
| `/app/settings` | Provider, fail-closed, enable/disable, customer messages, onboarding |
| `/app/test` | Immediate address test against the live engine |
| `/app/logs` | Paginated validation activity |
| `/app/analytics` | Trends, error mix, correction vs block rates |
| `/app/help` | Setup, checkout behavior, privacy, provider contract |

Date filter: Today, Last 7 days, Last 30 days, Custom range.

## 7. Customer checkout copy (defaults, merchant-editable)

Short, mobile-friendly, no extra popups. Banner pattern:

**Address needs attention**

We couldn't verify this address.

`123 Main Stret, New York, NY 10001`

Suggested address: `123 Main Street, New York, NY 10001`

**Use Suggested Address** · **Edit Address**

Configurable message keys: missing house number, invalid postal code, invalid city, city/postal mismatch, PO Box not allowed, special characters not allowed, invalid street, incomplete address, address could not be verified, service temporarily unavailable.

## 8. Privacy and GDPR

- Logs store country, original/corrected address lines, result, error type, action, checkout/order reference.
- Admin never renders customer name, email, or phone.
- Webhooks: `customers/data_request`, `customers/redact`, `shop/redact`, `app/uninstalled`.
- Uninstall deletes sessions and shop-owned rows.

## 9. Security

- Embedded app, session-token authenticated admin routes.
- Checkout API uses `authenticate.public.checkout`.
- Provider keys encrypted with a key derived from `SHOPIFY_API_SECRET`.
- Secrets live in `.env` only.
- No checkout logic in the Online Store theme.

## 9b. Added capabilities

Billing is usage-based: **$0.02 per unique Shopify order**, configured in `app/config/billing.json`. Checkout and post-checkout for the same order count once. Admin test addresses and provider outages are not billed.

Checkout validation is now paired with a queued `orders/create` post-checkout pass: auto-fix or review, customizable order tags, optional fulfillment holds, Klaviyo events, locale-specific messages, PO Box rules by country/method/zone, Allow/Warn/Fix/Block/Review actions, ROI analytics, a savings calculator, no-code setup, configurable billing plans, and background jobs with provider failover.

## 10. Development task list

1. Scaffold Remix app, env, Shopify TOML, Prisma/MySQL.
2. Implement provider interface, builtin engine, HTTP/Google/Loqate/Smarty adapters.
3. Persist shop settings, default rules, default messages.
4. Build Polaris admin pages.
5. Add checkout validate/correct APIs and logging.
6. Build Checkout UI + Thank You extensions.
7. Build Cart and Checkout Validation Function + metafield sync + Function activation.
8. Register OAuth, webhooks, GDPR handlers.
9. Install dependencies, push schema, verify TypeScript/build.

## 11. Local run

1. Start XAMPP MySQL.
2. Copy `.env` (already configured for this project).
3. `npm install`
4. `npx prisma db push`
5. `npm run dev` (Shopify CLI tunnel + install on a dev store)
6. Deploy extensions with `npm run deploy` when ready for a persistent store.
