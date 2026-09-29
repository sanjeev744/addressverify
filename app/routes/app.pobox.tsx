import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams, useSubmit } from "@remix-run/react";
import { Banner, BlockStack, Button, Select, TextField } from "@shopify/polaris";
import { useState } from "react";
import { AppPage } from "../components/AppPage";
import { RULE_ACTIONS } from "../lib/defaults";
import { ensureShopDefaults, savePoBoxRules } from "../services/shop.server";
import { syncShopConfig } from "../services/shopify-sync.server";
import { authenticate } from "../shopify.server";
import poboxStyles from "../styles/pobox.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: poboxStyles }];

type PoBoxRow = {
  id: string;
  name: string;
  action: string;
  country: string;
  shippingMethod: string;
  shippingZone: string;
  enabled: boolean;
};

const ACTION_OPTIONS = RULE_ACTIONS.filter((item) => item.value !== "fix").map((item) => ({
  label: item.label,
  value: item.value,
}));

const emptyRule = (): PoBoxRow => ({
  id: "",
  name: "New PO Box rule",
  action: "block",
  country: "",
  shippingMethod: "",
  shippingZone: "",
  enabled: true,
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundle = await ensureShopDefaults(session.shop);
  return { rules: bundle.poBoxRules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const count = Number(form.get("count") || 0);
  const rows = Array.from({ length: count }, (_, index) => ({
    id: String(form.get(`id:${index}`) || "") || undefined,
    name: String(form.get(`name:${index}`) || `PO Box rule ${index + 1}`),
    action: String(form.get(`action:${index}`) || "block"),
    country: String(form.get(`country:${index}`) || ""),
    shippingMethod: String(form.get(`shippingMethod:${index}`) || ""),
    shippingZone: String(form.get(`shippingZone:${index}`) || ""),
    enabled: form.get(`enabled:${index}`) === "true",
  }));
  await savePoBoxRules(session.shop, rows);
  await syncShopConfig(admin, session.shop);
  return redirect("/app/pobox?saved=1");
};

export default function PoBoxPage() {
  const { rules } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<PoBoxRow[]>(
    rules.length
      ? rules.map((rule) => ({
          id: rule.id || "",
          name: rule.name,
          action: rule.action,
          country: rule.country || "",
          shippingMethod: rule.shippingMethod || "",
          shippingZone: rule.shippingZone || "",
          enabled: rule.enabled,
        }))
      : [
          {
            id: "",
            name: "PO Boxes allowed for Standard Shipping",
            action: "allow",
            country: "",
            shippingMethod: "Standard",
            shippingZone: "",
            enabled: true,
          },
        ],
  );

  const updateRow = (index: number, patch: Partial<PoBoxRow>) => {
    setRows((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addRule = () => setRows((current) => [...current, emptyRule()]);

  const save = () => {
    const data = new FormData();
    data.set("count", String(rows.length));
    rows.forEach((row, index) => {
      data.set(`id:${index}`, row.id || "");
      data.set(`name:${index}`, row.name);
      data.set(`action:${index}`, row.action);
      data.set(`country:${index}`, row.country);
      data.set(`shippingMethod:${index}`, row.shippingMethod);
      data.set(`shippingZone:${index}`, row.shippingZone);
      data.set(`enabled:${index}`, String(row.enabled));
    });
    submit(data, { method: "post" });
  };

  const enabledCount = rows.filter((row) => row.enabled).length;

  return (
    <AppPage
      title="PO Box rules"
      subtitle="Allow, warn, block, or send PO Boxes to review by country, shipping method, or zone."
      primaryAction={{ content: "Save PO Box rules", onAction: save }}
      secondaryActions={[{ content: "Add rule", onAction: addRule }]}
    >
      <div className="av-pobox">
        <BlockStack gap="400">
          {searchParams.get("saved") ? (
            <Banner tone="success" title="PO Box rules saved">
              <p>Checkout will use the updated PO Box matching rules.</p>
            </Banner>
          ) : null}

          <div className="av-pobox__intro">
            <div className="av-pobox__intro-copy">
              <h2>Conditional PO Box handling</h2>
              <p>
                Most specific matching rule wins. If none match, the default PO Box action on Validation Rules is
                used.
              </p>
            </div>
            <span className="av-pobox__count">
              {enabledCount} of {rows.length} enabled
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="av-pobox__empty">
              <h3>No PO Box rules yet</h3>
              <p>Add a rule to allow PO Boxes for certain methods, or block them for specific countries.</p>
              <Button variant="primary" onClick={addRule}>
                Add rule
              </Button>
            </div>
          ) : (
            <div className="av-pobox__list">
              {rows.map((row, index) => (
                <article className="av-pobox__card" key={`${row.id || "new"}-${index}`}>
                  <div className="av-pobox__card-head">
                    <div className="av-pobox__card-head-left">
                      <span className="av-pobox__index">{index + 1}</span>
                      <h3 className="av-pobox__card-title">{row.name || `PO Box rule ${index + 1}`}</h3>
                    </div>
                    <div className="av-pobox__card-meta">
                      <span className={`av-pobox__action-chip av-pobox__action-chip--${row.action}`}>
                        {row.action}
                      </span>
                      <label className="av-toggle" data-on={row.enabled ? "true" : "false"}>
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(event) => updateRow(index, { enabled: event.target.checked })}
                          aria-label={`Enable ${row.name || `rule ${index + 1}`}`}
                        />
                        <span className="av-toggle__knob" />
                      </label>
                    </div>
                  </div>

                  <div className="av-pobox__card-body">
                    <div className="av-pobox__grid">
                      <div className="av-pobox__field--full">
                        <TextField
                          label="Name"
                          value={row.name}
                          onChange={(name) => updateRow(index, { name })}
                          autoComplete="off"
                        />
                      </div>
                      <Select
                        label="Action"
                        options={ACTION_OPTIONS}
                        value={row.action}
                        onChange={(action) => updateRow(index, { action })}
                      />
                      <TextField
                        label="Country code"
                        value={row.country}
                        onChange={(country) => updateRow(index, { country })}
                        placeholder="Blank = all countries"
                        autoComplete="off"
                        helpText="Example: US, CA, GB"
                      />
                      <TextField
                        label="Shipping method contains"
                        value={row.shippingMethod}
                        onChange={(shippingMethod) => updateRow(index, { shippingMethod })}
                        placeholder="Example: Express or Standard"
                        autoComplete="off"
                      />
                      <TextField
                        label="Shipping zone contains"
                        value={row.shippingZone}
                        onChange={(shippingZone) => updateRow(index, { shippingZone })}
                        placeholder="Optional"
                        autoComplete="off"
                      />
                    </div>
                    <div className="av-pobox__card-foot">
                      <Button
                        tone="critical"
                        variant="plain"
                        onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      >
                        Remove rule
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <p className="av-pobox__note">
            Tip: leave country blank to apply worldwide, or pair a country with a shipping method for tighter
            matching.
          </p>

          <div className="av-pobox__footer">
            <Button onClick={addRule}>Add rule</Button>
            <Button variant="primary" onClick={save}>
              Save PO Box rules
            </Button>
          </div>
        </BlockStack>
      </div>
    </AppPage>
  );
}
