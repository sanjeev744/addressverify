import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Divider,
  Icon,
  InlineStack,
  Modal,
  Text,
  TextField,
  View,
  useApi,
  useAppMetafields,
  useSubscription,
} from "@shopify/ui-extensions-react/checkout";
import { validateAddressLocally } from "./localValidate.js";

const EDIT_WINDOW_SECONDS = 10 * 60;
const MODAL_ID = "addressverify-shipping-modal";

const EMPTY_SUB = {
  current: undefined,
  subscribe: () => () => {},
};

export function ThankYouAddressWidget() {
  const api = useApi();
  const { ui } = api;
  const metafields = useAppMetafields({ namespace: "$app:addressverify", key: "config" });
  const config = readConfig(metafields);
  const loggedKey = useRef("");

  // Avoid useShippingAddress() — missing PCD scope crashes the extension.
  const shippingAddress = useSubscription(api.shippingAddress || EMPTY_SUB);
  const orderConfirmation = useSubscription(
    "orderConfirmation" in api && api.orderConfirmation ? api.orderConfirmation : EMPTY_SUB,
  );
  const order = useSubscription("order" in api && api.order ? api.order : EMPTY_SUB);
  const orderId = orderConfirmation?.order?.id || order?.id || null;

  const [result, setResult] = useState(null);
  const [address, setAddress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("review");
  const [secondsLeft, setSecondsLeft] = useState(EDIT_WINDOW_SECONDS);
  const [draft, setDraft] = useState(emptyDraft());
  const [doneMessage, setDoneMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const appUrl = (config.appUrl || "").replace(/\/$/, "");
  const thankYouEnabled = config.postCheckoutEnabled !== false;

  useEffect(() => {
    if (!thankYouEnabled) {
      setResult(null);
      return;
    }

    const current = addressFromShipping(shippingAddress);
    const payload = validateAddressLocally(current || {}, config);
    setResult(payload);
    setAddress(payload.address || current);
    setDraft(addressToDraft(payload.address || current));

    // Persist analytics even when the banner is hidden for valid addresses.
    const key = `${orderId || ""}:${current?.address1 || ""}:${current?.zip || ""}:${payload?.status || ""}`;
    if (appUrl && (current?.address1 || current?.zip) && loggedKey.current !== key) {
      loggedKey.current = key;
      logValidation(api, appUrl, payload, current, orderId).catch(() => {});
    }
  }, [
    thankYouEnabled,
    config.appUrl,
    appUrl,
    orderId,
    shippingAddress?.address1,
    shippingAddress?.address2,
    shippingAddress?.city,
    shippingAddress?.provinceCode,
    shippingAddress?.zip,
    shippingAddress?.countryCode,
    // Re-run when metafield config arrives
    metafields?.length,
  ]);

  useEffect(() => {
    if (!result || result.status === "valid" || result.status === "corrected") return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [result?.status]);

  const displayAddress = address || addressFromShipping(shippingAddress);
  const enteredLines = useMemo(() => formatAddressObjectLines(displayAddress), [displayAddress]);
  const suggestedLines = useMemo(
    () => (result?.suggested ? formatAddressObjectLines(result.suggested) : []),
    [result?.suggested],
  );

  if (doneMessage) {
    return (
      <Banner title="Address updated" status="success">
        <Text>{doneMessage}</Text>
      </Banner>
    );
  }

  if (!thankYouEnabled || !result || result.status === "valid" || !result.messageTitle) {
    return null;
  }

  const editingExpired = secondsLeft <= 0;

  async function saveAddress(nextAddress) {
    setBusy(true);
    setSaveError("");
    try {
      if (!appUrl || !orderId) {
        setSaveError("Address changes could not be saved yet. Please contact the store.");
        setBusy(false);
        return;
      }
      await correctOrder(api, appUrl, nextAddress, orderId);
      ui.overlay.close(MODAL_ID);
      setDoneMessage("Thanks. We updated the shipping address.");
    } catch (error) {
      setSaveError(
        error?.message?.includes?.("network_access")
          ? "Network access is not enabled for this app yet. Ask the merchant to allow network access in Shopify API access settings."
          : error?.message === "not_editable"
            ? "This order can no longer be edited here. Please contact the store to change the address."
            : "We could not save the address. Please try again or contact the store.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Banner title="Your address is not verified" status="warning">
      <BlockStack spacing="tight">
        <Text>
          {result.messageBody ||
            "We were not able to validate your address. Please recheck your shipping address."}
        </Text>
        <InlineStack spacing="tight" blockAlignment="center">
          <Text appearance="subdued">Time left to edit your address:</Text>
          <Text emphasis="bold" appearance={editingExpired ? "critical" : "warning"}>
            {formatCountdown(secondsLeft)} min
          </Text>
        </InlineStack>
        <Button
          kind="primary"
          disabled={editingExpired}
          overlay={
            <Modal
              id={MODAL_ID}
              title="Shipping Address"
              padding
              size="large"
              onClose={() => {
                setMode("review");
                setSaveError("");
              }}
            >
              <BlockStack spacing="base">
                <View border="base" cornerRadius="base" padding="base">
                  <InlineStack spacing="tight" blockAlignment="start">
                    <Icon source="info" />
                    <BlockStack spacing="extraTight">
                      <Text emphasis="bold">
                        {result.suggested
                          ? "We found a better match for your address"
                          : "Your address was not found"}
                      </Text>
                      <Text appearance="subdued">
                        Please choose one of our suggestions or edit your shipping address manually.
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </View>

                <View border="base" cornerRadius="base" padding="base" background="subdued">
                  <InlineStack spacing="tight" blockAlignment="start">
                    <Icon source="warning" appearance="warning" />
                    <BlockStack spacing="extraTight">
                      <Text emphasis="bold">Your entered address</Text>
                      {enteredLines.length ? (
                        enteredLines.map((line) => <Text key={line}>{line}</Text>)
                      ) : (
                        <Text appearance="subdued">No shipping address was found on this order.</Text>
                      )}
                    </BlockStack>
                  </InlineStack>
                </View>

                {suggestedLines.length ? (
                  <View border="base" cornerRadius="base" padding="base">
                    <BlockStack spacing="tight">
                      <InlineStack spacing="tight" blockAlignment="start">
                        <Icon source="success" appearance="success" />
                        <BlockStack spacing="extraTight">
                          <Text emphasis="bold">Suggested address</Text>
                          {suggestedLines.map((line) => (
                            <Text key={line}>{line}</Text>
                          ))}
                        </BlockStack>
                      </InlineStack>
                      <Button kind="primary" loading={busy} onPress={() => saveAddress(result.suggested)}>
                        Use suggested address
                      </Button>
                    </BlockStack>
                  </View>
                ) : null}

                {saveError ? (
                  <Banner status="critical" title="Could not save">
                    <Text>{saveError}</Text>
                  </Banner>
                ) : null}

                {mode === "edit" ? (
                  <BlockStack spacing="tight">
                    <Divider />
                    <Text emphasis="bold">Edit address manually</Text>
                    <TextField
                      label="Address"
                      value={draft.address1}
                      onChange={(value) => setDraft((current) => ({ ...current, address1: value }))}
                    />
                    <TextField
                      label="Apartment, suite, etc. (optional)"
                      value={draft.address2}
                      onChange={(value) => setDraft((current) => ({ ...current, address2: value }))}
                    />
                    <TextField
                      label="City"
                      value={draft.city}
                      onChange={(value) => setDraft((current) => ({ ...current, city: value }))}
                    />
                    <TextField
                      label="State / province"
                      value={draft.province}
                      onChange={(value) => setDraft((current) => ({ ...current, province: value }))}
                    />
                    <TextField
                      label="ZIP / postal code"
                      value={draft.zip}
                      onChange={(value) => setDraft((current) => ({ ...current, zip: value }))}
                    />
                    <TextField
                      label="Country"
                      value={draft.country}
                      onChange={(value) => setDraft((current) => ({ ...current, country: value }))}
                    />
                    <Button kind="primary" loading={busy} onPress={() => saveAddress(draft)}>
                      Save address
                    </Button>
                    <Button kind="plain" onPress={() => setMode("review")}>
                      Cancel
                    </Button>
                  </BlockStack>
                ) : (
                  <BlockStack spacing="tight">
                    <Button kind="secondary" onPress={() => setMode("edit")}>
                      Edit address manually
                    </Button>
                    <Button
                      kind="plain"
                      onPress={() => {
                        ui.overlay.close(MODAL_ID);
                        setDoneMessage("Thanks. We will keep the address you entered.");
                      }}
                    >
                      My address is correct
                    </Button>
                  </BlockStack>
                )}
              </BlockStack>
            </Modal>
          }
        >
          Check
        </Button>
      </BlockStack>
    </Banner>
  );
}

function emptyDraft() {
  return { address1: "", address2: "", city: "", province: "", zip: "", country: "" };
}

function addressFromShipping(shippingAddress) {
  if (!shippingAddress) return null;
  return {
    address1: shippingAddress.address1 || "",
    address2: shippingAddress.address2 || "",
    city: shippingAddress.city || "",
    province: shippingAddress.provinceCode || shippingAddress.province || "",
    zip: shippingAddress.zip || "",
    country: shippingAddress.countryCode || shippingAddress.country || "",
  };
}

function addressToDraft(address) {
  return {
    address1: address?.address1 || "",
    address2: address?.address2 || "",
    city: address?.city || "",
    province: address?.province || address?.provinceCode || "",
    zip: address?.zip || "",
    country: address?.country || address?.countryCode || "",
  };
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatAddressObjectLines(address) {
  if (!address) return [];
  return [
    [address.address1, address.address2].filter(Boolean).join(", "),
    [address.city, address.province || address.provinceCode, address.zip].filter(Boolean).join(" "),
    address.country || address.countryCode || "",
  ].filter(Boolean);
}

function readConfig(metafields) {
  const item = (metafields || []).find((entry) => entry?.metafield?.key === "config");
  try {
    return item?.metafield?.value ? JSON.parse(item.metafield.value) : {};
  } catch {
    return {};
  }
}

async function correctOrder(api, appUrl, address, orderId) {
  const token = await api.sessionToken.get();
  if (!orderId) throw new Error("missing_order");
  const response = await fetch(`${appUrl}/api/checkout/correct-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, address }),
  });
  if (response.status === 409) throw new Error("not_editable");
  if (!response.ok) throw new Error("save_failed");
}

async function logValidation(api, appUrl, payload, address, orderId) {
  try {
    const token = await api.sessionToken.get();
    await fetch(`${appUrl.replace(/\/$/, "")}/api/checkout/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source: "thank_you",
        orderId,
        address,
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
    // Network access may be blocked; analytics still backfills from Shopify orders.
  }
}
