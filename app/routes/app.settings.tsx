import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams, useSubmit } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  Checkbox,
  FormLayout,
  Select,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { AppPage } from "../components/AppPage";
import { checkoutEditorUrl } from "../lib/checkout-editor";
import {
  DEFAULT_MESSAGES,
  MERCHANT_MESSAGE_KEYS,
  MESSAGE_KEYS,
  TAG_KEYS,
  TAG_LABELS,
} from "../lib/defaults";
import { ensureShopDefaults, publicSettings, saveMessages, saveSettings, saveTags } from "../services/shop.server";
import { ensureValidationFunction, syncShopConfig } from "../services/shopify-sync.server";
import { authenticate } from "../shopify.server";
import settingsStyles from "../styles/settings.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: settingsStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundle = await ensureShopDefaults(session.shop);
  return {
    settings: publicSettings(bundle.settings),
    messages: bundle.messages,
    tags: bundle.tags,
    pages: {
      checkout: checkoutEditorUrl(session.shop, "checkout"),
      thankYou: checkoutEditorUrl(session.shop, "thank-you"),
      orderStatus: checkoutEditorUrl(session.shop, "order-status"),
    },
  };
};

/** Form numbers can be blank or non-numeric; NaN would make the Prisma update throw. */
function clampNumber(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (value === null || value === "" || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const existing = await ensureShopDefaults(session.shop);

  await saveSettings(session.shop, {
    validationEnabled: form.get("validationEnabled") === "true",
    failClosed: form.get("failClosed") === "true",
    postCheckoutEnabled: form.get("postCheckoutEnabled") === "true",
    postCheckoutMode: String(form.get("postCheckoutMode") || "auto"),
    postCheckoutMinConfidence: clampNumber(form.get("postCheckoutMinConfidence"), 0.8, 0, 1),
    holdInvalid: form.get("holdInvalid") === "true",
    holdUnconfirmed: form.get("holdUnconfirmed") === "true",
    holdPoBox: form.get("holdPoBox") === "true",
    holdReview: form.get("holdReview") === "true",
    avgOrderValue: clampNumber(form.get("avgOrderValue"), 85, 0, 1_000_000),
    avgReshipCost: clampNumber(form.get("avgReshipCost"), 12, 0, 1_000_000),
    avgSupportCost: clampNumber(form.get("avgSupportCost"), 8, 0, 1_000_000),
    onboarded: true,
  });

  const messageMap = new Map(existing.messages.map((item) => [item.messageKey, item]));
  await saveMessages(
    session.shop,
    MESSAGE_KEYS.map((key) => {
      const fromForm = (MERCHANT_MESSAGE_KEYS as readonly string[]).includes(key);
      const saved = messageMap.get(key);
      return {
        messageKey: key,
        title: fromForm
          ? String(form.get(`${key}:title`) || DEFAULT_MESSAGES[key].title)
          : saved?.title || DEFAULT_MESSAGES[key].title,
        body: fromForm
          ? String(form.get(`${key}:body`) || DEFAULT_MESSAGES[key].body)
          : saved?.body || DEFAULT_MESSAGES[key].body,
      };
    }),
  );
  await saveTags(
    session.shop,
    TAG_KEYS.map((key) => ({ tagKey: key, tag: String(form.get(`tag:${key}`) || key) })),
  );
  const bundle = await ensureShopDefaults(session.shop);
  await syncShopConfig(admin, session.shop, bundle);
  try {
    await ensureValidationFunction(admin, session.shop);
  } catch (error) {
    console.warn("AddressVerify function sync skipped", error);
  }
  return redirect("/app/settings?saved=1");
};

function messageLabel(key: string) {
  return key.replaceAll("_", " ");
}

export default function SettingsPage() {
  const { settings, messages, tags, pages } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const [validationEnabled, setValidationEnabled] = useState(settings.validationEnabled);
  const [failClosed, setFailClosed] = useState(settings.failClosed);
  const [postCheckoutEnabled, setPostCheckoutEnabled] = useState(settings.postCheckoutEnabled);
  const [postCheckoutMode, setPostCheckoutMode] = useState(settings.postCheckoutMode);
  const [postCheckoutMinConfidence, setPostCheckoutMinConfidence] = useState(
    String(settings.postCheckoutMinConfidence),
  );
  const [holdInvalid, setHoldInvalid] = useState(settings.holdInvalid);
  const [holdUnconfirmed, setHoldUnconfirmed] = useState(settings.holdUnconfirmed);
  const [holdPoBox, setHoldPoBox] = useState(settings.holdPoBox);
  const [holdReview, setHoldReview] = useState(settings.holdReview);
  const [avgOrderValue, setAvgOrderValue] = useState(String(settings.avgOrderValue));
  const [avgReshipCost, setAvgReshipCost] = useState(String(settings.avgReshipCost));
  const [avgSupportCost, setAvgSupportCost] = useState(String(settings.avgSupportCost));
  const [tagDraft, setTagDraft] = useState(
    Object.fromEntries(TAG_KEYS.map((key) => [key, tags.find((item) => item.tagKey === key)?.tag || key])),
  );
  const [copy, setCopy] = useState(
    Object.fromEntries(
      MERCHANT_MESSAGE_KEYS.map((key) => {
        const saved = messages.find((item) => item.messageKey === key);
        return [
          key,
          {
            title: saved?.title || DEFAULT_MESSAGES[key].title,
            body: saved?.body || DEFAULT_MESSAGES[key].body,
          },
        ];
      }),
    ),
  );

  const save = () => {
    const data = new FormData();
    data.set("validationEnabled", String(validationEnabled));
    data.set("failClosed", String(failClosed));
    data.set("postCheckoutEnabled", String(postCheckoutEnabled));
    data.set("postCheckoutMode", postCheckoutMode);
    data.set("postCheckoutMinConfidence", postCheckoutMinConfidence);
    data.set("holdInvalid", String(holdInvalid));
    data.set("holdUnconfirmed", String(holdUnconfirmed));
    data.set("holdPoBox", String(holdPoBox));
    data.set("holdReview", String(holdReview));
    data.set("avgOrderValue", avgOrderValue);
    data.set("avgReshipCost", avgReshipCost);
    data.set("avgSupportCost", avgSupportCost);
    for (const key of MERCHANT_MESSAGE_KEYS) {
      data.set(`${key}:title`, copy[key].title);
      data.set(`${key}:body`, copy[key].body);
    }
    for (const key of TAG_KEYS) data.set(`tag:${key}`, tagDraft[key]);
    submit(data, { method: "post" });
  };

  return (
    <AppPage
      title="Settings"
      subtitle="Configure validation, holds, tags, and customer messages."
      primaryAction={{ content: "Save settings", onAction: save }}
    >
      <div className="av-settings">
        <BlockStack gap="400">
          {searchParams.get("saved") ? (
            <Banner tone="success" title="Settings saved">
              <p>Checkout and post-checkout will use the updated configuration.</p>
            </Banner>
          ) : null}

          <div className="av-settings__status">
            <div className="av-settings__status-copy">
              <h2>Checkout validation</h2>
              <p>When enabled, AddressVerify checks shipping addresses before orders are placed.</p>
            </div>
            <span className={`av-settings__badge ${validationEnabled ? "av-settings__badge--on" : "av-settings__badge--off"}`}>
              <span className="av-settings__badge-dot" />
              {validationEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <section className="av-settings__section">
            <div className="av-settings__section-head">
              <h2 className="av-settings__section-title">Checkout pages</h2>
              <p className="av-settings__section-desc">
                Add AddressVerify in the checkout editor, then save there. Thank You and Order Status cover express
                checkouts.
              </p>
            </div>
            <div className="av-settings__section-body">
              <div className="av-settings__pages">
                <a className="av-settings__page-link" href={pages.thankYou} target="_blank" rel="noreferrer">
                  <strong>Thank You page</strong>
                  <span>Post-purchase address checks for completed orders</span>
                </a>
                <a className="av-settings__page-link" href={pages.orderStatus} target="_blank" rel="noreferrer">
                  <strong>Order Status page</strong>
                  <span>Validate and correct addresses on order status</span>
                </a>
                <a className="av-settings__page-link" href={pages.checkout} target="_blank" rel="noreferrer">
                  <strong>Checkout</strong>
                  <span>In-checkout validation during shipping address entry</span>
                </a>
              </div>
            </div>
          </section>

          <section className="av-settings__section">
            <div className="av-settings__section-head">
              <h2 className="av-settings__section-title">Enable validation</h2>
              <p className="av-settings__section-desc">
                Control whether validation runs at checkout and what happens if a provider is down.
              </p>
            </div>
            <div className="av-settings__section-body">
              <div className="av-settings__checks">
                <div className="av-settings__check-row">
                  <div className="av-settings__check-copy">
                    <strong>Validate shipping addresses at checkout</strong>
                    <span>Block or warn on address issues before payment.</span>
                  </div>
                  <Checkbox
                    label="Validate shipping addresses at checkout"
                    labelHidden
                    checked={validationEnabled}
                    onChange={setValidationEnabled}
                  />
                </div>
                <div className="av-settings__check-row">
                  <div className="av-settings__check-copy">
                    <strong>Fail closed if the provider is unavailable</strong>
                    <span>Leave off so a provider outage does not stop checkout.</span>
                  </div>
                  <Checkbox
                    label="Fail closed if the validation provider is unavailable"
                    labelHidden
                    checked={failClosed}
                    onChange={setFailClosed}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="av-settings__grid-2">
            <section className="av-settings__section">
              <div className="av-settings__section-head">
                <h2 className="av-settings__section-title">Post-checkout correction</h2>
                <p className="av-settings__section-desc">
                  Optionally validate and fix addresses after the order is created.
                </p>
              </div>
              <div className="av-settings__section-body">
                <div className="av-settings__field-gap">
                  <Checkbox
                    label="Validate and optionally fix addresses after the order is created"
                    checked={postCheckoutEnabled}
                    onChange={setPostCheckoutEnabled}
                  />
                  <Select
                    label="When a reliable correction is available"
                    options={[
                      { label: "Automatically update the order", value: "auto" },
                      { label: "Require merchant review", value: "review" },
                    ]}
                    value={postCheckoutMode}
                    onChange={setPostCheckoutMode}
                  />
                  <TextField
                    label="Minimum confidence to auto-fix (0–1)"
                    value={postCheckoutMinConfidence}
                    onChange={setPostCheckoutMinConfidence}
                    autoComplete="off"
                  />
                </div>
              </div>
            </section>

            <section className="av-settings__section">
              <div className="av-settings__section-head">
                <h2 className="av-settings__section-title">Order holds</h2>
                <p className="av-settings__section-desc">
                  Pause fulfillment when serious address issues are found. Turn all off to never hold automatically.
                </p>
              </div>
              <div className="av-settings__section-body">
                <div className="av-settings__checks">
                  <Checkbox label="Hold invalid addresses" checked={holdInvalid} onChange={setHoldInvalid} />
                  <Checkbox
                    label="Hold unconfirmed addresses"
                    checked={holdUnconfirmed}
                    onChange={setHoldUnconfirmed}
                  />
                  <Checkbox label="Hold PO Box addresses" checked={holdPoBox} onChange={setHoldPoBox} />
                  <Checkbox label="Hold addresses that require review" checked={holdReview} onChange={setHoldReview} />
                </div>
              </div>
            </section>
          </div>

          <section className="av-settings__section">
            <div className="av-settings__section-head">
              <h2 className="av-settings__section-title">Order tags</h2>
              <p className="av-settings__section-desc">
                Existing AddressVerify tags are replaced, not duplicated, when an order is revalidated.
              </p>
            </div>
            <div className="av-settings__section-body">
              <div className="av-settings__grid-2">
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
            </div>
          </section>

          <section className="av-settings__section">
            <div className="av-settings__section-head">
              <h2 className="av-settings__section-title">ROI assumptions</h2>
              <p className="av-settings__section-desc">
                Used for estimated savings on the dashboard and Analytics pages.
              </p>
            </div>
            <div className="av-settings__section-body">
              <div className="av-settings__grid-3">
                <TextField
                  label="Average order value"
                  type="number"
                  prefix="$"
                  value={avgOrderValue}
                  onChange={setAvgOrderValue}
                  autoComplete="off"
                />
                <TextField
                  label="Average reshipping cost"
                  type="number"
                  prefix="$"
                  value={avgReshipCost}
                  onChange={setAvgReshipCost}
                  autoComplete="off"
                />
                <TextField
                  label="Average support cost per error"
                  type="number"
                  prefix="$"
                  value={avgSupportCost}
                  onChange={setAvgSupportCost}
                  autoComplete="off"
                />
              </div>
            </div>
          </section>

          <section className="av-settings__section">
            <div className="av-settings__section-head">
              <h2 className="av-settings__section-title">Customer messages</h2>
              <p className="av-settings__section-desc">
                Default English copy shown at checkout. Validation logic does not depend on language.
              </p>
            </div>
            <div className="av-settings__section-body">
              <div className="av-settings__messages">
                {MERCHANT_MESSAGE_KEYS.map((key) => (
                  <div className="av-settings__message" key={key}>
                    <p className="av-settings__message-key">{messageLabel(key)}</p>
                    <FormLayout>
                      <TextField
                        label="Title"
                        value={copy[key].title}
                        onChange={(title) =>
                          setCopy((current) => ({ ...current, [key]: { ...current[key], title } }))
                        }
                        autoComplete="off"
                      />
                      <TextField
                        label="Message"
                        value={copy[key].body}
                        onChange={(body) =>
                          setCopy((current) => ({ ...current, [key]: { ...current[key], body } }))
                        }
                        multiline={2}
                        autoComplete="off"
                      />
                    </FormLayout>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="av-settings__footer">
            <Button variant="primary" onClick={save}>
              Save settings
            </Button>
          </div>
        </BlockStack>
      </div>
    </AppPage>
  );
}
