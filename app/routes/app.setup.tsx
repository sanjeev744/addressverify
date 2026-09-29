import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams, useSubmit } from "@remix-run/react";
import { Banner, BlockStack, Button, Checkbox, Icon, Select, TextField } from "@shopify/polaris";
import {
  CartIcon,
  CashDollarIcon,
  CheckCircleIcon,
  CodeIcon,
  DiscountIcon,
  OrderIcon,
  SettingsIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
import { useMemo, useState } from "react";
import { AppPage } from "../components/AppPage";
import { checkoutEditorUrl, isLiteRule, LITE_RULE_KEYS } from "../lib/checkout-editor";
import {
  DEFAULT_TAGS,
  HIDDEN_RULE_KEYS,
  RULE_CATALOG,
  RULE_KEYS,
  TAG_KEYS,
  TAG_LABELS,
  type RuleKey,
} from "../lib/defaults";
import { BILLING_CONFIG, formatPlanPrice, isTestBillingEnabled } from "../lib/plans";
import { ensureBillingTier } from "../services/billing.server";
import { ensureShopDefaults, saveRules, saveSettings, saveTags } from "../services/shop.server";
import { syncShopConfig } from "../services/shopify-sync.server";
import { authenticate } from "../shopify.server";
import setupStyles from "../styles/setup.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: setupStyles }];

function validationModeFromRules(rules: Array<{ ruleKey: string; enabled: boolean }>) {
  const enabled = new Set(rules.filter((rule) => rule.enabled).map((rule) => rule.ruleKey));
  const liteOnly =
    LITE_RULE_KEYS.every((key) => enabled.has(key)) &&
    RULE_KEYS.filter((key) => !isLiteRule(key)).every((key) => !enabled.has(key));
  return liteOnly ? "lite" : "full";
}

function SetupToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="av-setup-toggle" data-on={checked ? "true" : "false"}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="av-setup-toggle__knob" />
    </label>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const bundle = await ensureShopDefaults(session.shop);
  let recommendedHandle = bundle.settings.planHandle;
  let terms = BILLING_CONFIG.terms;
  let price = formatPlanPrice(recommendedHandle);
  try {
    const tierInfo = await ensureBillingTier(session.shop, admin);
    recommendedHandle = tierInfo.recommendedTier.handle;
    terms = tierInfo.recommendedTier.terms;
    price = formatPlanPrice(recommendedHandle);
  } catch {
    // Admin API may be unavailable during first paint.
  }
  return {
    shop: session.shop,
    settings: bundle.settings,
    rules: bundle.rules,
    tags: bundle.tags,
    price,
    terms,
    recommendedHandle,
    pages: {
      checkout: checkoutEditorUrl(session.shop, "checkout"),
      thankYou: checkoutEditorUrl(session.shop, "thank-you"),
      orderStatus: checkoutEditorUrl(session.shop, "order-status"),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "save");
  if (intent === "approve_billing") {
    const tierInfo = await ensureBillingTier(session.shop, admin);
    const planHandle = tierInfo.recommendedTier.handle;
    await billing.request({
      plan: planHandle as never,
      isTest: isTestBillingEnabled(),
      returnUrl: `${process.env.SHOPIFY_APP_URL || ""}/app/setup`,
    });
    return null;
  }

  const mode = String(form.get("validationMode") || "full") === "lite" ? "lite" : "full";
  await saveSettings(session.shop, {
    validationEnabled: form.get("validationEnabled") === "true",
    postCheckoutEnabled: form.get("postCheckoutEnabled") === "true",
    postCheckoutMode: String(form.get("postCheckoutMode") || "auto"),
    holdInvalid: form.get("holdInvalid") === "true",
    holdReview: form.get("holdReview") === "true",
    holdPoBox: form.get("holdPoBox") === "true",
    holdUnconfirmed: form.get("holdUnconfirmed") === "true",
    onboarded: true,
    onboardingStep: 7,
  });
  await saveRules(
    session.shop,
    RULE_KEYS.map((ruleKey) => {
      const hidden = (HIDDEN_RULE_KEYS as RuleKey[]).includes(ruleKey);
      const liteRule = isLiteRule(ruleKey);
      return {
        ruleKey,
        enabled: hidden ? false : mode === "full" || liteRule,
        action: RULE_CATALOG[ruleKey].defaultAction,
      };
    }),
  );
  await saveTags(
    session.shop,
    TAG_KEYS.map((tagKey) => ({
      tagKey,
      tag: String(form.get(`tag:${tagKey}`) || DEFAULT_TAGS[tagKey]),
    })),
  );
  const bundle = await ensureShopDefaults(session.shop);
  await syncShopConfig(admin, session.shop, bundle);
  return redirect("/app/setup?saved=1");
};

export default function SetupPage() {
  const { settings, rules, tags, price, terms, pages } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const [validationEnabled, setValidationEnabled] = useState(settings.validationEnabled);
  const [validationMode, setValidationMode] = useState<"lite" | "full">(validationModeFromRules(rules));
  const [postCheckoutEnabled, setPostCheckoutEnabled] = useState(settings.postCheckoutEnabled);
  const [postCheckoutMode, setPostCheckoutMode] = useState(settings.postCheckoutMode);
  const [holdInvalid, setHoldInvalid] = useState(settings.holdInvalid);
  const [holdReview, setHoldReview] = useState(settings.holdReview);
  const [holdPoBox, setHoldPoBox] = useState(settings.holdPoBox);
  const [holdUnconfirmed, setHoldUnconfirmed] = useState(settings.holdUnconfirmed);
  const [pagesOpened, setPagesOpened] = useState(false);
  const [tagDraft, setTagDraft] = useState(
    Object.fromEntries(TAG_KEYS.map((key) => [key, tags.find((item) => item.tagKey === key)?.tag || DEFAULT_TAGS[key]])),
  );

  const saved = searchParams.get("saved") === "1" || settings.onboarded;
  const stepDone = useMemo(
    () => [
      pagesOpened || settings.onboarded,
      validationEnabled,
      Boolean(validationMode),
      postCheckoutEnabled,
      TAG_KEYS.every((key) => Boolean(tagDraft[key]?.trim())),
      saved,
    ],
    [pagesOpened, settings.onboarded, validationEnabled, validationMode, postCheckoutEnabled, tagDraft, saved],
  );
  const completedCount = stepDone.filter(Boolean).length;
  const progressPct = Math.round((completedCount / 6) * 100);

  const save = () => {
    const data = new FormData();
    data.set("intent", "save");
    data.set("validationEnabled", String(validationEnabled));
    data.set("validationMode", validationMode);
    data.set("postCheckoutEnabled", String(postCheckoutEnabled));
    data.set("postCheckoutMode", postCheckoutMode);
    data.set("holdInvalid", String(holdInvalid));
    data.set("holdReview", String(holdReview));
    data.set("holdPoBox", String(holdPoBox));
    data.set("holdUnconfirmed", String(holdUnconfirmed));
    for (const key of TAG_KEYS) data.set(`tag:${key}`, tagDraft[key]);
    submit(data, { method: "post" });
  };

  const approveBilling = () => {
    const data = new FormData();
    data.set("intent", "approve_billing");
    submit(data, { method: "post" });
  };

  return (
    <AppPage
      title="Set up AddressVerify"
      subtitle="Add the app to checkout pages, turn on validation, then save to go live."
      primaryAction={{ content: "Save settings", onAction: save }}
    >
      <div className="av-setup">
        {searchParams.get("saved") === "1" ? (
          <div className="av-setup__saved">
            <Banner tone="success" title="Settings saved">
              AddressVerify is active. Place a test order to confirm the banner on Thank You and Order Status.
            </Banner>
          </div>
        ) : null}

        <div className="av-setup__progress">
          <div className="av-setup__progress-left">
            <span className="av-setup__progress-icon">
              <Icon source={CheckCircleIcon} />
            </span>
            <div>
              <h2 className="av-setup__progress-title">Complete setup</h2>
              <p className="av-setup__progress-desc">
                Follow the steps below, then click Save settings. Nothing is live until you save.
              </p>
            </div>
          </div>
          <div className="av-setup__progress-right">
            <div className="av-setup__progress-meta">
              {completedCount} of 6 completed
            </div>
            <div className="av-setup__progress-bar" aria-hidden>
              <span style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>

        <div className="av-setup__steps">
          <section className="av-setup__step">
            <div className="av-setup__step-head">
              <span className="av-setup__step-num" data-done={stepDone[0] ? "true" : "false"}>
                1
              </span>
              <div>
                <h2 className="av-setup__step-title">Add AddressVerify to checkout pages</h2>
                <p className="av-setup__step-desc">
                  Thank You and Order Status catch Shop Pay, Apple Pay, Google Pay, and PayPal. Checkout is for
                  in-checkout suggestions.
                </p>
              </div>
            </div>
            <div className="av-setup__pages">
              <a
                className="av-setup__page"
                href={pages.thankYou}
                target="_blank"
                rel="noreferrer"
                onClick={() => setPagesOpened(true)}
              >
                <span className="av-setup__page-icon">
                  <Icon source={CartIcon} />
                </span>
                <strong>Thank You page</strong>
                <span>Post-purchase checks for completed orders</span>
                <span className="av-setup__page-cta">Open editor →</span>
              </a>
              <a
                className="av-setup__page"
                href={pages.orderStatus}
                target="_blank"
                rel="noreferrer"
                onClick={() => setPagesOpened(true)}
              >
                <span className="av-setup__page-icon">
                  <Icon source={OrderIcon} />
                </span>
                <strong>Order Status page</strong>
                <span>Validate and correct on order status</span>
                <span className="av-setup__page-cta">Open editor →</span>
              </a>
              <a
                className="av-setup__page"
                href={pages.checkout}
                target="_blank"
                rel="noreferrer"
                onClick={() => setPagesOpened(true)}
              >
                <span className="av-setup__page-icon">
                  <Icon source={DiscountIcon} />
                </span>
                <strong>Checkout</strong>
                <span>In-checkout validation during address entry</span>
                <span className="av-setup__page-cta">Open editor →</span>
              </a>
            </div>
            <div className="av-setup__tip">
              <Icon source={CodeIcon} />
              <span>In the editor: Apps → AddressVerify → add the block → Save.</span>
            </div>
          </section>

          <section className="av-setup__step">
            <div className="av-setup__step-head">
              <span className="av-setup__step-num" data-done={stepDone[1] ? "true" : "false"}>
                2
              </span>
              <div>
                <h2 className="av-setup__step-title">Activate in-checkout validation</h2>
                <p className="av-setup__step-desc">
                  Shows suggestions on Checkout and can block invalid addresses at submit, including express wallets.
                </p>
              </div>
            </div>
            <div className="av-setup__toggle-card">
              <div className="av-setup__toggle-left">
                <span className="av-setup__toggle-icon">
                  <Icon source={ShieldCheckMarkIcon} />
                </span>
                <div className="av-setup__toggle-copy">
                  <strong>Enable in-checkout address validation</strong>
                  <span>Turn this on before going live with checkout checks.</span>
                </div>
              </div>
              <SetupToggle
                checked={validationEnabled}
                onChange={setValidationEnabled}
                label="Enable in-checkout address validation"
              />
            </div>
          </section>

          <section className="av-setup__step">
            <div className="av-setup__step-head">
              <span className="av-setup__step-num" data-done={stepDone[2] ? "true" : "false"}>
                3
              </span>
              <div>
                <h2 className="av-setup__step-title">Choose validation level</h2>
                <p className="av-setup__step-desc">Start with Lite for a simple go-live, or Full for complete checks.</p>
              </div>
            </div>
            <div className="av-setup__modes" role="radiogroup" aria-label="Validation level">
              <label className="av-setup__mode" data-selected={validationMode === "lite" ? "true" : "false"}>
                <input
                  type="radio"
                  name="validationMode"
                  checked={validationMode === "lite"}
                  onChange={() => setValidationMode("lite")}
                />
                <span className="av-setup__mode-radio" aria-hidden />
                <div className="av-setup__mode-top">
                  <span className="av-setup__mode-icon av-setup__mode-icon--lite" aria-hidden>
                    ⚡
                  </span>
                  <strong>Lite</strong>
                </div>
                <ul>
                  <li>House number</li>
                  <li>PO Boxes</li>
                  <li>Special characters</li>
                </ul>
              </label>
              <label className="av-setup__mode" data-selected={validationMode === "full" ? "true" : "false"}>
                <input
                  type="radio"
                  name="validationMode"
                  checked={validationMode === "full"}
                  onChange={() => setValidationMode("full")}
                />
                <span className="av-setup__mode-radio" aria-hidden />
                <div className="av-setup__mode-top">
                  <span className="av-setup__mode-icon" aria-hidden>
                    ♛
                  </span>
                  <strong>Full</strong>
                </div>
                <ul>
                  <li>Street, city, postal code</li>
                  <li>Typos & incomplete addresses</li>
                  <li>Suggested corrections</li>
                </ul>
              </label>
            </div>

            <div className="av-setup__billing">
              <div className="av-setup__billing-left">
                <span className="av-setup__billing-icon">
                  <Icon source={CashDollarIcon} />
                </span>
                <div>
                  <p className="av-setup__billing-price">{price}</p>
                  <p className="av-setup__billing-terms">{terms}</p>
                </div>
              </div>
              <Button variant="primary" onClick={approveBilling}>
                Approve {price} in Shopify
              </Button>
            </div>
          </section>

          <section className="av-setup__step">
            <div className="av-setup__step-head">
              <span className="av-setup__step-num" data-done={stepDone[3] ? "true" : "false"}>
                4
              </span>
              <div>
                <h2 className="av-setup__step-title">Post-checkout validation</h2>
                <p className="av-setup__step-desc">
                  Runs on Thank You and Order Status so express checkouts are still checked.
                </p>
              </div>
            </div>
            <BlockStack gap="0">
              <div className="av-setup__toggle-card">
                <div className="av-setup__toggle-left">
                  <span className="av-setup__toggle-icon">
                    <Icon source={OrderIcon} />
                  </span>
                  <div className="av-setup__toggle-copy">
                    <strong>Validate addresses after checkout</strong>
                    <span>Recommended for Shop Pay and other express wallets.</span>
                  </div>
                </div>
                <SetupToggle
                  checked={postCheckoutEnabled}
                  onChange={setPostCheckoutEnabled}
                  label="Validate addresses after checkout"
                />
              </div>
              <div className="av-setup__select">
                <Select
                  label="When a reliable correction is available"
                  options={[
                    { label: "Automatically update the order", value: "auto" },
                    { label: "Ask the customer / merchant to review", value: "review" },
                  ]}
                  value={postCheckoutMode}
                  onChange={setPostCheckoutMode}
                />
              </div>
              <div className="av-setup__holds">
                <Checkbox label="Hold invalid addresses" checked={holdInvalid} onChange={setHoldInvalid} />
                <Checkbox label="Hold addresses that need review" checked={holdReview} onChange={setHoldReview} />
                <Checkbox label="Hold PO Boxes" checked={holdPoBox} onChange={setHoldPoBox} />
                <Checkbox
                  label="Hold unconfirmed addresses"
                  checked={holdUnconfirmed}
                  onChange={setHoldUnconfirmed}
                />
              </div>
            </BlockStack>
          </section>

          <section className="av-setup__step">
            <div className="av-setup__step-head">
              <span className="av-setup__step-num" data-done={stepDone[4] ? "true" : "false"}>
                5
              </span>
              <div>
                <h2 className="av-setup__step-title">Tag orders by error type</h2>
                <p className="av-setup__step-desc">
                  AddressVerify replaces its previous address tags on an order. It does not stack duplicates.
                </p>
              </div>
            </div>
            <div className="av-setup__grid-2">
              {TAG_KEYS.map((key) => (
                <TextField
                  key={key}
                  label={TAG_LABELS[key]}
                  value={tagDraft[key]}
                  onChange={(value) => setTagDraft((current) => ({ ...current, [key]: value }))}
                  autoComplete="off"
                />
              ))}
            </div>
          </section>

          <section className="av-setup__step">
            <div className="av-setup__step-head">
              <span className="av-setup__step-num" data-done={stepDone[5] ? "true" : "false"}>
                6
              </span>
              <div>
                <h2 className="av-setup__step-title">Save and go live</h2>
                <p className="av-setup__step-desc">
                  Save these settings so checkout, tags, and post-checkout checks actually run.
                </p>
              </div>
            </div>
            <div className="av-setup__finish">
              <div className="av-setup__tip">
                <Icon source={SettingsIcon} />
                <span>You can refine rules anytime under Validation Rules and Settings.</span>
              </div>
              <div className="av-setup__finish-actions">
                <Button url="/app">Open dashboard</Button>
                <Button variant="primary" onClick={save}>
                  Save settings
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppPage>
  );
}
