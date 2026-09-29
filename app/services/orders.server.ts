import prisma from "../db.server";
import { planAllows } from "../lib/plans";
import { DEFAULT_TAGS, type TagKey } from "../lib/defaults";
import { eventsFromResult, sendKlaviyoEvent } from "./klaviyo.server";
import { getShopBillingMeta, recordBillableOrder } from "./billing.server";
import { recordValidation } from "./logs.server";
import { logEvent } from "./monitor.server";
import {
  ensureShopDefaults,
  toMerchantRules,
  toMessages,
  toPoBoxRules,
  toProviderConfig,
  toTagMap,
  toTranslations,
} from "./shop.server";
import {
  holdOrderFulfillments,
  releaseOrderHolds,
  replaceAddressTags,
  updateOrderAddress,
} from "./shopify-sync.server";
import { validateAddress } from "./validation/engine";
import { normalizeAddress, type AddressInput, type ValidationResult } from "./validation/types";
import { unauthenticated } from "../shopify.server";

export interface IncomingOrder {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  tags?: string | string[];
  shipping_address?: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    province_code?: string;
    zip?: string;
    country?: string;
    country_code?: string;
  };
  shipping_lines?: Array<{ title?: string; code?: string }>;
  customer?: { id?: number | string };
  customer_locale?: string;
}

export async function processOrderCreated(shop: string, order: IncomingOrder) {
  const bundle = await ensureShopDefaults(shop);
  // Nothing is validated when the merchant turned both checks off, so don't tag or bill the order.
  if (!bundle.settings.validationEnabled && !bundle.settings.postCheckoutEnabled) {
    return;
  }
  const orderId = String(order.admin_graphql_api_id || order.id || "");
  const orderName = order.name || `#${order.id || ""}`;
  const address = normalizeAddress({
    address1: order.shipping_address?.address1,
    address2: order.shipping_address?.address2,
    city: order.shipping_address?.city,
    province: order.shipping_address?.province_code || order.shipping_address?.province,
    zip: order.shipping_address?.zip,
    country: order.shipping_address?.country_code || order.shipping_address?.country,
  });
  if (!address.address1 && !address.zip) {
    return;
  }

  const shippingMethod = order.shipping_lines?.[0]?.title || order.shipping_lines?.[0]?.code || "";
  const result = await validateAddress(address, {
    shop,
    rules: toMerchantRules(bundle.rules),
    messages: toMessages(bundle.messages),
    translations: toTranslations(bundle.translations),
    provider: toProviderConfig(bundle.settings),
    failClosed: false,
    validationEnabled: true,
    poBoxRules: toPoBoxRules(bundle.poBoxRules),
    context: { locale: order.customer_locale, shippingMethod },
  });

  let correctedAutomatically = false;
  let held = false;
  const { admin } = await unauthenticated.admin(shop);
  const currentTags = Array.isArray(order.tags)
    ? order.tags
    : String(order.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  if (
    bundle.settings.postCheckoutEnabled &&
    planAllows(bundle.settings.planHandle, "post_checkout") &&
    bundle.settings.postCheckoutMode === "auto" &&
    result.suggested &&
    (result.actionTaken === "fix" || result.status === "corrected") &&
    (result.confidence || 0) >= bundle.settings.postCheckoutMinConfidence
  ) {
    const updated = await updateOrderAddress(admin, orderId, result.suggested);
    correctedAutomatically = updated.ok;
    if (!updated.ok) {
      await logEvent(shop, "warn", `Automatic address correction failed for ${orderName}`, { error: updated.error });
    }
  }

  const tags = tagsForResult(result, toTagMap(bundle.tags), correctedAutomatically);
  if (planAllows(bundle.settings.planHandle, "tags")) {
    await replaceAddressTags(admin, orderId, currentTags, tags);
  }

  const holdReason = holdReasonFor(result, bundle.settings, correctedAutomatically);
  // A retried job must not stack a second hold on the same order.
  const existingHold = holdReason
    ? await prisma.orderHold.findFirst({ where: { shop, orderId }, select: { id: true, status: true } })
    : null;
  if (existingHold) {
    held = existingHold.status === "open";
  } else if (holdReason && planAllows(bundle.settings.planHandle, "holds")) {
    const fulfillmentIds = await holdOrderFulfillments(admin, orderId, holdReason);
    held = fulfillmentIds.length > 0;
    await prisma.orderHold.create({
      data: {
        shop,
        orderId,
        orderName,
        reason: holdReason,
        errorType: result.errorTypes[0] || null,
        originalAddress: [address.address1, address.city, address.zip, address.country].filter(Boolean).join(", "),
        suggestedAddress: result.suggested
          ? [result.suggested.address1, result.suggested.city, result.suggested.zip, result.suggested.country]
              .filter(Boolean)
              .join(", ")
          : null,
        fulfillmentIds: JSON.stringify(fulfillmentIds),
      },
    });
  }

  await recordValidation({
    shop,
    result,
    original: address,
    orderRef: orderName,
    customerId: order.customer?.id ? String(order.customer.id) : null,
    source: "post_checkout",
    locale: order.customer_locale,
    shippingMethod,
    held,
    reviewRequired: result.actionTaken === "review" || bundle.settings.postCheckoutMode === "review",
    correctedAutomatically,
  });

  const billingMeta = await getShopBillingMeta(shop);
  await recordBillableOrder({
    shop,
    orderId,
    source: "post_checkout",
    result,
    admin,
    shopId: billingMeta.shopGid,
  });

  if (planAllows(bundle.settings.planHandle, "klaviyo")) {
    const properties = {
      orderId,
      orderName,
      validationResult: result.status,
      errorType: result.errorTypes[0] || "",
      originalAddressStatus: result.status === "valid" ? "valid" : "needs_attention",
      correctionStatus: correctedAutomatically ? "fixed" : result.suggested ? "suggested" : "none",
      country: address.country,
      postalCode: address.zip,
    };
    for (const event of eventsFromResult(result)) {
      await sendKlaviyoEvent(shop, bundle.settings.klaviyoApiKey, bundle.settings.klaviyoEnabled, event, properties);
    }
  }

  await logEvent(shop, "info", `Post-checkout validation for ${orderName}`, {
    result: result.status,
    action: result.actionTaken,
    held,
    correctedAutomatically,
  });
}

export async function resolveHold(
  shop: string,
  holdId: string,
  applySuggestion: boolean,
) {
  const hold = await prisma.orderHold.findFirst({ where: { id: holdId, shop } });
  if (!hold) return null;
  const { admin } = await unauthenticated.admin(shop);
  if (applySuggestion && hold.suggestedAddress) {
    // Stored as "address1, city, zip, country"; a comma inside a part makes it ambiguous.
    const parts = hold.suggestedAddress.split(",").map((part) => part.trim());
    if (parts.length !== 4) {
      throw new Error("The suggested address could not be applied automatically. Edit the order in Shopify admin.");
    }
    const [address1, city, zip, country] = parts;
    const updated = await updateOrderAddress(admin, hold.orderId, { address1, city, zip, country });
    if (!updated.ok) {
      throw new Error(`Shopify rejected the address update: ${updated.error}`);
    }
    await prisma.validationLog.updateMany({
      where: { shop, orderRef: hold.orderName },
      data: { manuallyCorrected: true, held: false },
    });
  }
  const fulfillmentIds = hold.fulfillmentIds ? (JSON.parse(hold.fulfillmentIds) as string[]) : [];
  if (fulfillmentIds.length) {
    await releaseOrderHolds(admin, fulfillmentIds);
  }
  return prisma.orderHold.update({
    where: { id: hold.id },
    data: { status: "released", releasedAt: new Date() },
  });
}

function tagsForResult(result: ValidationResult, map: Record<string, string>, fixed: boolean) {
  const value = (key: TagKey) => map[key] || DEFAULT_TAGS[key];
  const tags: string[] = [];
  if (result.status === "valid" && !result.errorTypes.length) tags.push(value("address_valid"));
  if (fixed || result.actionTaken === "fix") tags.push(value("address_fixed"));
  if (result.status === "invalid" || result.actionTaken === "block") tags.push(value("address_invalid"));
  if (result.errorTypes.includes("missing_house_number")) tags.push(value("address_missing_house_number"));
  if (result.errorTypes.includes("po_box_not_allowed")) tags.push(value("address_po_box"));
  if (result.errorTypes.includes("special_characters_not_allowed")) tags.push(value("address_special_character"));
  if (result.errorTypes.includes("street_typo") || result.actionTaken === "fix") tags.push(value("address_typo_corrected"));
  if (result.status === "unavailable" || result.errorTypes.includes("address_unverified")) {
    tags.push(value("address_unconfirmed"));
  }
  if (result.actionTaken === "review") tags.push(value("address_review"));
  return [...new Set(tags)];
}

function holdReasonFor(
  result: ValidationResult,
  settings: {
    holdInvalid: boolean;
    holdUnconfirmed: boolean;
    holdPoBox: boolean;
    holdReview: boolean;
  },
  correctedAutomatically: boolean,
) {
  if (correctedAutomatically && result.actionTaken !== "review") return null;
  if (settings.holdInvalid && (result.status === "invalid" || result.actionTaken === "block")) {
    return result.messageBody || "The shipping address could not be verified.";
  }
  if (settings.holdUnconfirmed && (result.status === "unavailable" || result.errorTypes.includes("address_unverified"))) {
    return result.messageBody || "This address is unconfirmed.";
  }
  if (settings.holdPoBox && result.errorTypes.includes("po_box_not_allowed")) {
    return "PO Box addresses require review for this shipping method.";
  }
  if (settings.holdReview && result.actionTaken === "review") {
    return result.messageBody || "This address was marked for merchant review.";
  }
  return null;
}

export function holdTitle(orderName: string) {
  return `${orderName} — Address incorrect`;
}
