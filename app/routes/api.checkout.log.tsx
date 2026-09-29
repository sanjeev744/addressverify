import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { recordValidation } from "../services/logs.server";
import { normalizeAddress } from "../services/validation/types";
import type { ValidationResult } from "../services/validation/types";
import { authenticate } from "../shopify.server";

/**
 * Lightweight endpoint for checkout UI extensions to persist analytics events.
 * Used when full validation already ran locally in the extension.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  const shop = String(sessionToken.dest || "").replace(/^https:\/\//, "");
  const payload = await request.json().catch(() => ({}));
  const address = normalizeAddress(payload.address || {});

  const result = (payload.result || {
    valid: payload.valid !== false,
    status: payload.status || (payload.valid === false ? "invalid" : "valid"),
    confidence: payload.confidence ?? 0.5,
    errorTypes: payload.errorTypes || [],
    issues: [],
    suggested: payload.suggested || null,
    normalized: address,
    provider: "extension",
    actionTaken: payload.actionTaken || (payload.valid === false ? "review" : "allow"),
    messageTitle: payload.messageTitle,
    messageBody: payload.messageBody,
  }) as ValidationResult;

  await recordValidation({
    shop,
    result,
    original: address,
    checkoutRef: payload.checkoutToken || payload.checkoutRef,
    orderRef: payload.orderId || payload.orderRef,
    customerId: payload.customerId,
    source: payload.source || "thank_you",
    locale: payload.locale,
    shippingMethod: payload.shippingMethod,
    held: Boolean(payload.held),
    reviewRequired: Boolean(payload.reviewRequired),
    correctedAutomatically: Boolean(payload.correctedAutomatically),
    manuallyCorrected: Boolean(payload.manuallyCorrected),
  });

  return cors(json({ ok: true }));
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response(null, { status: 204 }));
};
