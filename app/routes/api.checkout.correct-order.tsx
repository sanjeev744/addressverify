import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { normalizeOrderId } from "../services/billing.server";
import { getShopBundle } from "../services/shop.server";
import { getShopOrder, updateOrderAddress } from "../services/shopify-sync.server";
import { normalizeAddress } from "../services/validation/types";
import { authenticate, unauthenticated } from "../shopify.server";

/** Customers may fix their address shortly after ordering, before anything ships. */
const CORRECTION_WINDOW_MS = 60 * 60 * 1000;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  const shop = String(sessionToken.dest || "").replace(/^https:\/\//, "");
  const payload = await request.json().catch(() => ({}));
  const orderId = normalizeOrderId(payload.orderId);
  const address = normalizeAddress(payload.address);

  if (!orderId || !address.address1 || !address.city || !address.country) {
    return cors(json({ ok: false, error: "invalid_request" }, { status: 400 }));
  }

  const bundle = await getShopBundle(shop);
  if (!bundle.settings.postCheckoutEnabled) {
    return cors(json({ ok: false, error: "disabled" }, { status: 403 }));
  }

  const { admin } = await unauthenticated.admin(shop);
  const order = await getShopOrder(admin, orderId);
  const tooOld = !order || Date.now() - new Date(order.createdAt).getTime() > CORRECTION_WINDOW_MS;
  const shipped = order && !["UNFULFILLED", "ON_HOLD", "SCHEDULED", "PENDING_FULFILLMENT", "OPEN"].includes(order.fulfillmentStatus);
  if (!order || order.cancelled || tooOld || shipped) {
    return cors(json({ ok: false, error: "not_editable" }, { status: 409 }));
  }

  const updated = await updateOrderAddress(admin, order.id, address);
  if (!updated.ok) {
    console.warn("AddressVerify customer address correction failed", shop, updated.error);
    return cors(json({ ok: false, error: "update_failed" }, { status: 502 }));
  }
  return cors(json({ ok: true }));
};
