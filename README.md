# AddressVerify

Shopify app that validates shipping addresses before checkout completes, suggests corrections, and gives merchants rules, logs, and analytics.

AddressHero is a functional reference only. This project does not copy that app’s branding, copy, or implementation.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the Shopify API plan, database, screens, validation flow, and task list.

## Requirements

- Node 20.19+ or 22.12+
- XAMPP MySQL / MariaDB
- Shopify Partner app credentials
- A Shopify development store

## Database

Database: `addressverify`  
User: `root`  
Password: empty

```bash
D:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS addressverify CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm install
npx prisma generate
npx prisma db push
```

## Local development

1. Start MySQL in XAMPP.
2. Confirm `.env` has the Shopify client ID, secret, and `DATABASE_URL`.
3. Run `npm run dev` and install the app on a development store.
4. In the Shopify admin, open AddressVerify and complete Settings → Rules → Test Address.
5. In the Partner Dashboard, request protected customer data access for physical address.

Checkout UI extensions that render on the information/shipping steps require Checkout Extensibility (Shopify Plus on many stores). The Cart and Checkout Validation Function still enforces block rules on all plans, including express checkout. Thank-you and order-status extensions can offer a correction after the order.

## Scripts

- `npm run dev` — Shopify CLI development
- `npm run deploy` — deploy app and extensions
- `npm run setup` — generate Prisma client and push schema
- `npm run lint` — TypeScript check

## Provider

Default provider is the built-in engine. Settings can switch to Custom HTTP, Google Address Validation, Loqate, or Smarty without changing checkout or admin business logic.
# addressverify
# addressverify
# addressverify
# addressverify
