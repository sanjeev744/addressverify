import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { Banner, BlockStack, Card, Checkbox, List, Text, TextField } from "@shopify/polaris";
import { AppPage } from "../components/AppPage";
import { useState } from "react";
import { planAllows } from "../lib/plans";
import { ensureShopDefaults, publicSettings, saveSettings } from "../services/shop.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const bundle = await ensureShopDefaults(session.shop);
  return {
    settings: publicSettings(bundle.settings),
    allowed: planAllows(bundle.settings.planHandle, "klaviyo"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await saveSettings(session.shop, {
    klaviyoEnabled: form.get("klaviyoEnabled") === "true",
    klaviyoApiKey: String(form.get("klaviyoApiKey") || "") || undefined,
  });
  return redirect("/app/klaviyo?saved=1");
};

export default function KlaviyoPage() {
  const { settings, allowed } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [enabled, setEnabled] = useState(settings.klaviyoEnabled);
  const [apiKey, setApiKey] = useState("");

  return (
    <AppPage
      title="Klaviyo"
      subtitle="Optional. Send address-validation events into Klaviyo flows without extra customer identifiers."
      primaryAction={allowed ? { content: "Save Klaviyo", onAction: () => {
        const data = new FormData();
        data.set("klaviyoEnabled", String(enabled));
        data.set("klaviyoApiKey", apiKey);
        submit(data, { method: "post" });
      } } : undefined}
    >
      <BlockStack gap="400">
        {!allowed ? <Banner tone="warning" title="Klaviyo is available on Pro and Enterprise plans." /> : null}
        {typeof window !== "undefined" && window.location.search.includes("saved=1") ? <Banner tone="success" title="Klaviyo settings saved" /> : null}
        <Card>
          <BlockStack gap="300">
            <Checkbox label="Send AddressVerify events to Klaviyo" checked={enabled} onChange={setEnabled} disabled={!allowed} />
            <TextField
              label={settings.hasKlaviyoKey ? "Private API key (saved — enter a new value to replace)" : "Klaviyo private API key"}
              value={apiKey}
              onChange={setApiKey}
              type="password"
              autoComplete="off"
              disabled={!allowed}
            />
            <Text as="p" tone="subdued">Events include order ID, result, error type, correction status, country, postal code, and timestamp. Full street lines and emails are not sent.</Text>
            <Text as="h2" variant="headingSm">Events</Text>
            <List>
              <List.Item>Address Validated</List.Item>
              <List.Item>Address Error Detected</List.Item>
              <List.Item>Address Automatically Fixed</List.Item>
              <List.Item>Address Requires Review</List.Item>
              <List.Item>PO Box Detected</List.Item>
              <List.Item>Address Correction Required</List.Item>
            </List>
          </BlockStack>
        </Card>
      </BlockStack>
    </AppPage>
  );
}
