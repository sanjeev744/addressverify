import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useSubmit } from "@remix-run/react";
import { BlockStack, Button, Card, FormLayout, Layout, Text, TextField } from "@shopify/polaris";
import { AppPage } from "../components/AppPage";
import { useState } from "react";
import { ValidationResultPanel } from "../components/ValidationResultPanel";
import { recordValidation } from "../services/logs.server";
import {
  ensureShopDefaults,
  toMerchantRules,
  toMessages,
  toPoBoxRules,
  toProviderConfig,
  toTranslations,
} from "../services/shop.server";
import { validateAddress } from "../services/validation/engine";
import { formatAddress, normalizeAddress } from "../services/validation/types";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const address = normalizeAddress({
    address1: String(form.get("address1") || ""),
    address2: String(form.get("address2") || ""),
    city: String(form.get("city") || ""),
    province: String(form.get("province") || ""),
    zip: String(form.get("zip") || ""),
    country: String(form.get("country") || "US"),
  });
  const bundle = await ensureShopDefaults(session.shop);
  const result = await validateAddress(address, {
    shop: session.shop,
    rules: toMerchantRules(bundle.rules),
    messages: toMessages(bundle.messages),
    translations: toTranslations(bundle.translations),
    provider: toProviderConfig(bundle.settings),
    failClosed: bundle.settings.failClosed,
    validationEnabled: true,
    poBoxRules: toPoBoxRules(bundle.poBoxRules),
  });
  await recordValidation({
    shop: session.shop,
    result,
    original: address,
    source: "test",
  });
  return { result, original: formatAddress(address) };
};

export default function TestAddressPage() {
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [address1, setAddress1] = useState("123 Main Stret");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("New York");
  const [province, setProvince] = useState("NY");
  const [zip, setZip] = useState("10001");
  const [country, setCountry] = useState("US");

  const run = () => {
    const data = new FormData();
    data.set("address1", address1);
    data.set("address2", address2);
    data.set("city", city);
    data.set("province", province);
    data.set("zip", zip);
    data.set("country", country);
    submit(data, { method: "post" });
  };

  return (
    <AppPage title="Test address" subtitle="Run the live validation engine without placing an order.">
      <Layout>
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Address
              </Text>
              <FormLayout>
                <TextField label="Street" value={address1} onChange={setAddress1} autoComplete="off" />
                <TextField label="Apartment, suite" value={address2} onChange={setAddress2} autoComplete="off" />
                <TextField label="City" value={city} onChange={setCity} autoComplete="off" />
                <TextField label="State / province" value={province} onChange={setProvince} autoComplete="off" />
                <TextField label="ZIP / postal code" value={zip} onChange={setZip} autoComplete="off" />
                <TextField label="Country code" value={country} onChange={setCountry} autoComplete="off" />
              </FormLayout>
              <Button variant="primary" onClick={run}>
                Validate address
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneHalf">
          {actionData?.result ? (
            <ValidationResultPanel result={actionData.result} original={actionData.original} />
          ) : (
            <Card>
              <Text as="p" tone="subdued">
                Submit an address to see valid / invalid, suggested correction, error type, and confidence.
              </Text>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </AppPage>
  );
}
