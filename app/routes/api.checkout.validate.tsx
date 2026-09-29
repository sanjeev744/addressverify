import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getShopBillingMeta, normalizeOrderId, recordBillableOrder } from "../services/billing.server";
import { recordValidation } from "../services/logs.server";
import { getShopOrder } from "../services/shopify-sync.server";
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
  const address = normalizeAddress(payload.address || payload);
  const bundle = await ensureShopDefaults(shop);
  const result = await validateAddress(address, {
    shop,
    rules: toMerchantRules(bundle.rules),
    messages: toMessages(bundle.messages),
    translations: toTranslations(bundle.translations),
    provider: toProviderConfig(bundle.settings),
    failClosed: bundle.settings.failClosed,
    validationEnabled:
      bundle.settings.validationEnabled ||
      ((payload.source === "thank_you" || payload.source === "order_status") &&
        bundle.settings.postCheckoutEnabled),
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
    orderRef: payload.orderRef,
    customerId: payload.customerId,
    source: payload.source || "checkout",
    locale: payload.locale,
    shippingMethod: payload.shippingMethod,
  });
  const orderId = normalizeOrderId(payload.orderId || payload.orderRef);
  if (orderId && (payload.source || "checkout") !== "test") {
    const { admin } = await unauthenticated.admin(shop);
    // The order id comes from the storefront; only bill orders that really exist on this shop.
    const order = await getShopOrder(admin, orderId).catch(() => null);
    if (order) {
      const billingMeta = await getShopBillingMeta(shop);
      await recordBillableOrder({
        shop,
        orderId: order.id,
        source: payload.source || "checkout",
        result,
        admin,
        shopId: billingMeta.shopGid,
      });
    }
  }
  return cors(json(checkoutPayload(result, address)));
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response(null, { status: 204 }));
};
