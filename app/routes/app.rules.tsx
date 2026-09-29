import type { LinksFunction, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { Banner, BlockStack, Card, Select, Text } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { AppPage } from "../components/AppPage";
import {
  HIDDEN_RULE_KEYS,
  MERCHANT_RULE_KEYS,
  RULE_ACTIONS,
  RULE_CATALOG,
  RULE_KEYS,
  normalizeAction,
  type RuleAction,
  type RuleKey,
} from "../lib/defaults";
import { ensureShopDefaults, saveRules } from "../services/shop.server";
import { ensureValidationFunction, syncShopConfig } from "../services/shopify-sync.server";
import { authenticate } from "../shopify.server";
import rulesStyles from "../styles/rules.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: rulesStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundle = await ensureShopDefaults(session.shop);
  return { rules: bundle.rules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const existing = await ensureShopDefaults(session.shop);
  const existingMap = new Map(existing.rules.map((rule) => [rule.ruleKey, rule]));

  const rules = RULE_KEYS.map((ruleKey) => {
    // Removed from merchant UI — keep stored action but force disabled.
    if ((HIDDEN_RULE_KEYS as RuleKey[]).includes(ruleKey)) {
      const prev = existingMap.get(ruleKey);
      return {
        ruleKey,
        enabled: false,
        action: String(prev?.action || RULE_CATALOG[ruleKey].defaultAction),
      };
    }
    return {
      ruleKey,
      enabled: form.get(`${ruleKey}:enabled`) === "true",
      action: String(form.get(`${ruleKey}:action`) || "block"),
    };
  });
  await saveRules(session.shop, rules);
  const bundle = await ensureShopDefaults(session.shop);
  await syncShopConfig(admin, session.shop, bundle);
  try {
    await ensureValidationFunction(admin, session.shop);
  } catch (error) {
    console.warn("AddressVerify function sync skipped", error);
  }
  return { ok: true as const };
};

const ACTION_OPTIONS = RULE_ACTIONS.map((item) => ({
  label: item.label,
  value: item.value,
}));

const CHECK_LABELS: Partial<Record<RuleKey, string>> = {
  block_po_boxes: "PO Boxes",
  auto_correct_typos: "Automatically correct common typos",
};

function actionHint(action: RuleAction) {
  return RULE_ACTIONS.find((item) => item.value === action)?.help || "";
}

export default function RulesPage() {
  const { rules } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [draft, setDraft] = useState(
    Object.fromEntries(
      MERCHANT_RULE_KEYS.map((ruleKey) => {
        const rule = rules.find((item) => item.ruleKey === ruleKey);
        return [
          ruleKey,
          {
            enabled: rule?.enabled ?? RULE_CATALOG[ruleKey].defaultEnabled,
            action: normalizeAction(rule?.action || RULE_CATALOG[ruleKey].defaultAction),
          },
        ];
      }),
    ),
  );
  const [showSaved, setShowSaved] = useState(false);

  const saving = navigation.state !== "idle" && navigation.formMethod === "POST";

  useEffect(() => {
    if (navigation.state === "idle" && actionData?.ok) {
      setShowSaved(true);
    }
  }, [navigation.state, actionData]);

  const save = () => {
    const data = new FormData();
    for (const key of MERCHANT_RULE_KEYS) {
      data.set(`${key}:enabled`, draft[key]?.enabled ? "true" : "false");
      data.set(`${key}:action`, draft[key]?.action || "block");
    }
    setShowSaved(false);
    submit(data, { method: "post" });
  };

  return (
    <AppPage
      title="Validation Rules"
      subtitle="Choose what happens when a check fails"
      primaryAction={{ content: saving ? "Saving…" : "Save rules", onAction: save, loading: saving, disabled: saving }}
    >
      <div className="av-rules">
        <BlockStack gap="400">
          {showSaved ? (
            <Banner tone="success" title="Rules saved" onDismiss={() => setShowSaved(false)}>
              <p>Checkout and the validation function will use these settings.</p>
            </Banner>
          ) : null}

          <Card padding="0">
            <div className="av-rules-card">
              <table className="av-rules-table">
                <thead>
                  <tr>
                    <th scope="col">Check</th>
                    <th scope="col">Action</th>
                    <th scope="col" className="av-rules-status-head">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MERCHANT_RULE_KEYS.map((key) => {
                    const enabled = Boolean(draft[key]?.enabled);
                    const action = (draft[key]?.action || "block") as RuleAction;
                    const title = CHECK_LABELS[key] || RULE_CATALOG[key].title;

                    return (
                      <tr key={key}>
                        <td className="av-rules-check">
                          <p className="av-rules-check__title">{title}</p>
                          <p className="av-rules-check__help">{RULE_CATALOG[key].help}</p>
                        </td>
                        <td className="av-rules-action">
                          <Select
                            label="Action"
                            labelHidden
                            options={ACTION_OPTIONS}
                            value={action}
                            disabled={!enabled}
                            onChange={(next) =>
                              setDraft((current) => ({
                                ...current,
                                [key]: {
                                  enabled: current[key]?.enabled ?? true,
                                  action: next as RuleAction,
                                },
                              }))
                            }
                            helpText={
                              <span className="av-action-option">
                                <span className={`av-action-dot av-action-dot--${action}`} aria-hidden />
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {actionHint(action)}
                                </Text>
                              </span>
                            }
                          />
                        </td>
                        <td className="av-rules-status">
                          <label
                            className="av-toggle"
                            data-on={enabled ? "true" : "false"}
                            title={enabled ? "Enabled" : "Disabled"}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              aria-label={`Enable ${title}`}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  [key]: {
                                    enabled: event.currentTarget.checked,
                                    action: current[key]?.action || "block",
                                  },
                                }))
                              }
                            />
                            <span className="av-toggle__knob" />
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </BlockStack>
      </div>
    </AppPage>
  );
}
