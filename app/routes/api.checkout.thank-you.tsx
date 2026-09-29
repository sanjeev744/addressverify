import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getShopBillingMeta, normalizeOrderId, recordBillableOrder } from "../services/billing.server";
import { recordValidation } from "../services/logs.server";
import { getOrderShippingAddress, getShopOrder } from "../services/shopify-sync.server";
import {
  ensureShopDefaults,
  toMerchantRules,
  toMessages,
  toPoBoxRules,
  toProviderConfig,
  toTranslations,
} from "../services/shop.server";
import { checkoutPayload, validateAddress } from "../services/validation/engine";
import { normalizeAddress } from "../services/validation/types";
import { authenticate, unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  const shop = String(sessionToken.dest || "").replace(/^https:\/\//, "");
  const payload = await request.json().catch(() => ({}));
  const orderId = normalizeOrderId(payload.orderId || payload.orderRef);
  const bundle = await ensureShopDefaults(shop);
  const enabled =
    bundle.settings.postCheckoutEnabled || bundle.settings.validationEnabled;

  if (!enabled) {
    return cors(
      json({
        valid: true,
        status: "valid",
        confidence: 1,
        errorTypes: [],
        actionTaken: "allow",
        messageTitle: null,
        messageBody: null,
        original: null,
        suggested: null,
        suggestedFormatted: null,
        address: null,
        enabled: false,
      }),
    );
  }

  const { admin } = await unauthenticated.admin(shop);
  let address = normalizeAddress(payload.address || {});
  if (orderId && (!address.address1 || !address.zip || !address.country)) {
    const fromOrder = await getOrderShippingAddress(admin, orderId);
    if (fromOrder) address = normalizeAddress(fromOrder);
  }

  if (!address.address1 && !address.zip) {
    return cors(
      json({
        valid: false,
        status: "invalid",
        confidence: 0,
        errorTypes: ["incomplete_address"],
        actionTaken: "review",
        messageTitle: "Your address is not verified",
        messageBody: "We were not able to validate your address. Please recheck your shipping address.",
        original: null,
        suggested: null,
        suggestedFormatted: null,
        address: null,
        enabled: true,
      }),
    );
  }

  const result = await validateAddress(address, {
    shop,
    rules: toMerchantRules(bundle.rules),
    messages: toMessages(bundle.messages),
    translations: toTranslations(bundle.translations),
    provider: toProviderConfig(bundle.settings),
    failClosed: bundle.settings.failClosed,
    validationEnabled: true,
    poBoxRules: toPoBoxRules(bundle.poBoxRules),
    context: {
      locale: payload.locale,
      shippingMethod: payload.shippingMethod,
      shippingZone: payload.shippingZone,
    },
  });

  await recordValidation({
    shop,
    result,
    original: address,
    checkoutRef: payload.checkoutToken || payload.checkoutRef,
    orderRef: orderId || payload.orderRef,
    customerId: payload.customerId,
    source: payload.source || "thank_you",
    locale: payload.locale,
    shippingMethod: payload.shippingMethod,
  });

  if (orderId && (payload.source || "thank_you") !== "test") {
    // The order id comes from the storefront; only bill orders that really exist on this shop.
    const order = await getShopOrder(admin, orderId).catch(() => null);
    if (order) {
      const billingMeta = await getShopBillingMeta(shop);
      await recordBillableOrder({
        shop,
        orderId: order.id,
        source: payload.source || "thank_you",
        result,
        admin,
        shopId: billingMeta.shopGid,
      });
    }
  }

  return cors(
    json({
      ...checkoutPayload(result, address),
      address,
      enabled: true,
      appUrl: process.env.SHOPIFY_APP_URL || "",
    }),
  );
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response(null, { status: 204 }));
};
