import { useEffect, useRef, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  InlineStack,
  Text,
  useApi,
  useAppMetafields,
  useSubscription,
} from "@shopify/ui-extensions-react/checkout";
import { validateAddressLocally } from "./localValidate.js";

const EMPTY_SUB = {
  current: undefined,
  subscribe: () => () => {},
};

export function AddressBanner({ surface = "checkout" }) {
  const api = useApi();
  // Avoid useShippingAddress() — missing PCD scope crashes the extension.
  const shippingAddress = useSubscription(api.shippingAddress || EMPTY_SUB);
  const metafields = useAppMetafields({ namespace: "$app:addressverify", key: "config" });
  const applyShippingAddressChange = api.applyShippingAddressChange;
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastApplied = useRef("");
  const config = readConfig(metafields);

  useEffect(() => {
    if (!config.validationEnabled || !shippingAddress) return;
    if (!shippingAddress.address1 && !shippingAddress.zip) return;

    const handle = setTimeout(() => {
      const run = config.appUrl
        ? validate(api, config.appUrl, shippingAddress, surface).catch(() => null)
        : Promise.resolve(null);

      run.then(async (payload) => {
        const next =
          payload ||
          validateAddressLocally(
            {
              address1: shippingAddress.address1 || "",
              address2: shippingAddress.address2 || "",
              city: shippingAddress.city || "",
              province: shippingAddress.provinceCode || "",
              zip: shippingAddress.zip || "",
              country: shippingAddress.countryCode || "",
            },
            config,
          );

        if (config.appUrl && !payload) {
          logCheckoutValidation(api, config.appUrl, next, shippingAddress, surface).catch(() => {});
        }

        setResult(next);
        if (
          surface === "checkout" &&
          (next?.actionTaken === "auto_correct" || next?.actionTaken === "fix") &&
          next.suggested &&
          lastApplied.current !== next.suggestedFormatted &&
          applyShippingAddressChange
        ) {
          lastApplied.current = next.suggestedFormatted;
          await applyShippingAddressChange({
            type: "updateShippingAddress",
            address: toShopifyAddress(next.suggested),
          });
        }
      });
    }, 700);

    return () => clearTimeout(handle);
  }, [
    shippingAddress?.address1,
    shippingAddress?.address2,
    shippingAddress?.city,
    shippingAddress?.provinceCode,
    shippingAddress?.zip,
    shippingAddress?.countryCode,
    config.appUrl,
    config.validationEnabled,
    surface,
  ]);

  if (!result || result.status === "valid" || !result.messageTitle) {
    return null;
  }

  const tone = result.actionTaken === "block" ? "critical" : "warning";

  return (
    <Banner title={result.messageTitle} status={tone}>
      <BlockStack spacing="tight">
        <Text>{result.messageBody}</Text>
        {result.original ? <Text appearance="subdued">{result.original}</Text> : null}
        {result.suggestedFormatted ? (
          <Text emphasis="bold">Suggested address: {result.suggestedFormatted}</Text>
        ) : null}
        <InlineStack spacing="base">
          {result.suggested && surface === "checkout" && applyShippingAddressChange ? (
            <Button
              kind="primary"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                lastApplied.current = result.suggestedFormatted;
                await applyShippingAddressChange({
                  type: "updateShippingAddress",
                  address: toShopifyAddress(result.suggested),
                });
                setBusy(false);
              }}
            >
              Use Suggested Address
            </Button>
          ) : null}
          {result.suggested && surface === "thank_you" && config.appUrl ? (
            <Button
              kind="primary"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                await correctOrder(api, config.appUrl, result.suggested);
                setBusy(false);
                setResult({ ...result, status: "corrected", messageBody: "Thanks. We updated the shipping address." });
              }}
            >
              Use Suggested Address
            </Button>
          ) : null}
          <Button
            kind="secondary"
            onPress={() => {
              if (surface === "checkout") {
                setResult(null);
              }
            }}
          >
            Edit Address
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}

function readConfig(metafields) {
  const item = (metafields || []).find((entry) => entry?.metafield?.key === "config");
  try {
    return item?.metafield?.value ? JSON.parse(item.metafield.value) : {};
  } catch {
    return {};
  }
}

async function validate(api, appUrl, shippingAddress, source) {
  const token = await api.sessionToken.get();
  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/checkout/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      source,
      locale: api.localization?.language?.isoCode || api.language?.isoCode,
      shippingMethod: api.selectedShippingOption?.title || api.deliveryGroups?.[0]?.selectedDeliveryOption?.title,
      checkoutToken: api.checkoutToken || api.analytics?.checkoutToken,
      orderRef: api.orderConfirmation?.order?.id,
      address: {
        address1: shippingAddress.address1 || "",
        address2: shippingAddress.address2 || "",
        city: shippingAddress.city || "",
        province: shippingAddress.provinceCode || "",
        zip: shippingAddress.zip || "",
        country: shippingAddress.countryCode || "",
      },
    }),
  });
  if (!response.ok) return null;
  return response.json();
}

async function correctOrder(api, appUrl, address) {
  const token = await api.sessionToken.get();
  const orderId = api.orderConfirmation?.order?.id;
  if (!orderId) return;
  await fetch(`${appUrl.replace(/\/$/, "")}/api/checkout/correct-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, address }),
  });
}

async function logCheckoutValidation(api, appUrl, payload, shippingAddress, source) {
  try {
    const token = await api.sessionToken.get();
    await fetch(`${appUrl.replace(/\/$/, "")}/api/checkout/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source,
        address: {
          address1: shippingAddress.address1 || "",
          address2: shippingAddress.address2 || "",
          city: shippingAddress.city || "",
          province: shippingAddress.provinceCode || "",
          zip: shippingAddress.zip || "",
          country: shippingAddress.countryCode || "",
        },
        valid: payload?.valid !== false,
        status: payload?.status || "valid",
        confidence: payload?.confidence ?? 0.5,
        errorTypes: payload?.errorTypes || [],
        suggested: payload?.suggested || null,
        actionTaken: payload?.actionTaken || "allow",
        messageTitle: payload?.messageTitle,
        messageBody: payload?.messageBody,
        locale: api.localization?.language?.isoCode || api.language?.isoCode,
      }),
    });
  } catch {
    // Ignore — analytics backfills from Shopify orders when network is blocked.
  }
}

function toShopifyAddress(address) {
  return {
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    provinceCode: address.province,
    zip: address.zip,
    countryCode: address.country,
  };
}
