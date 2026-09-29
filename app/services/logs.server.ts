import { getTierByHandle } from "../lib/plans";
import { estimateSavings as calculateSavings } from "../lib/savings";
import { rangeFromPreset, type DatePreset } from "../lib/defaults";
import { formatAddress, type AddressInput, type ValidationResult } from "./validation/types";
import prisma from "../db.server";
import { hashIdentifier } from "../lib/crypto.server";

/** Webhooks send numeric ids, Admin GraphQL sends gids; hash one canonical form so redaction matches. */
function customerKey(customerId?: string | null) {
  if (!customerId) return null;
  const raw = String(customerId).trim();
  return raw.match(/^gid:\/\/shopify\/Customer\/(\d+)$/i)?.[1] || raw || null;
}

export function hashCustomerId(customerId?: string | null) {
  return hashIdentifier(customerKey(customerId));
}

export async function recordValidation(input: {
  shop: string;
  result: ValidationResult;
  original: AddressInput;
  checkoutRef?: string | null;
  orderRef?: string | null;
  customerId?: string | null;
  source: string;
  locale?: string | null;
  shippingMethod?: string | null;
  held?: boolean;
  reviewRequired?: boolean;
  correctedAutomatically?: boolean;
  manuallyCorrected?: boolean;
}) {
  return prisma.validationLog.create({
    data: {
      shop: input.shop,
      checkoutRef: hashIdentifier(input.checkoutRef),
      orderRef: input.orderRef || null,
      customerId: hashCustomerId(input.customerId),
      country: input.original.country || null,
      postalCode: input.original.zip || null,
      locale: input.locale || null,
      shippingMethod: input.shippingMethod || null,
      originalAddress: formatAddress(input.original),
      correctedAddress: input.result.suggested ? formatAddress(input.result.suggested) : null,
      result: input.result.status,
      errorType: input.result.errorTypes[0] || null,
      actionTaken: input.result.actionTaken,
      confidence: input.result.confidence,
      source: input.source,
      held: Boolean(input.held),
      reviewRequired: Boolean(input.reviewRequired || input.result.actionTaken === "review"),
      correctedAutomatically: Boolean(input.correctedAutomatically || input.result.actionTaken === "fix"),
      manuallyCorrected: Boolean(input.manuallyCorrected),
    },
  });
}

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

/** Industry baseline used when ROI assumptions have no observed error rate yet. */
const ASSUMED_ADDRESS_ERROR_RATE = 0.05;

export async function getAnalytics(
  shop: string,
  preset: DatePreset,
  start?: string,
  end?: string,
  admin?: AdminClient,
) {
  const { from, to } = rangeFromPreset(preset, start, end);
  const where = { shop, createdAt: { gte: from, lte: to } };
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const [
    total,
    valid,
    invalid,
    corrected,
    blocked,
    warnings,
    unavailable,
    autoFixed,
    manualFixed,
    held,
    review,
    grouped,
    recent,
  ] = await Promise.all([
    prisma.validationLog.count({ where }),
    prisma.validationLog.count({ where: { ...where, result: "valid" } }),
    prisma.validationLog.count({ where: { ...where, result: "invalid" } }),
    prisma.validationLog.count({ where: { ...where, result: "corrected" } }),
    prisma.validationLog.count({ where: { ...where, actionTaken: "block" } }),
    prisma.validationLog.count({ where: { ...where, result: "warning" } }),
    prisma.validationLog.count({ where: { ...where, result: "unavailable" } }),
    prisma.validationLog.count({ where: { ...where, correctedAutomatically: true } }),
    prisma.validationLog.count({ where: { ...where, manuallyCorrected: true } }),
    prisma.validationLog.count({ where: { ...where, held: true } }),
    prisma.validationLog.count({ where: { ...where, reviewRequired: true } }),
    prisma.validationLog.groupBy({
      by: ["errorType"],
      where: { ...where, errorType: { not: null } },
      _count: { errorType: true },
      orderBy: { _count: { errorType: "desc" } },
      take: 12,
    }),
    prisma.validationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        country: true,
        result: true,
        errorType: true,
        actionTaken: true,
        originalAddress: true,
        source: true,
        orderRef: true,
        checkoutRef: true,
      },
    }),
  ]);

  let ordersCount = total;
  if (admin) {
    try {
      const { getOrdersCountInRange } = await import("./shopify-sync.server");
      const shopifyCount = await getOrdersCountInRange(admin, from, to);
      if (shopifyCount > ordersCount) ordersCount = shopifyCount;
    } catch (error) {
      console.warn("AddressVerify analytics ordersCount skipped", error);
    }
  }

  // Prefer validation logs for "Checked"; fall back to Shopify order volume.
  const checked = Math.max(total, ordersCount);
  const errors = Math.max(0, total - valid);
  const observedErrorRate = total ? errors / total : 0;
  const errorRatePct = total
    ? Math.round(observedErrorRate * 1000) / 10
    : Math.round(ASSUMED_ADDRESS_ERROR_RATE * 1000) / 10;
  const successRate = total ? Math.round(((valid + corrected) / total) * 100) : 100;
  const aov = settings?.avgOrderValue || 85;
  const reship = settings?.avgReshipCost || 12;
  const support = settings?.avgSupportCost || 8;
  const correctionRate = settings?.estimatedCorrectionRate ?? 0.7;
  const preventedActual = blocked + autoFixed + held + manualFixed + corrected;

  let estimatedSavedShipments = preventedActual;
  let estimatesAreProjected = false;
  if (estimatedSavedShipments <= 0 && checked > 0) {
    const rate = observedErrorRate > 0 ? observedErrorRate : ASSUMED_ADDRESS_ERROR_RATE;
    const projectedErrors = Math.round(checked * rate);
    estimatedSavedShipments = Math.max(1, Math.round(projectedErrors * correctionRate));
    estimatesAreProjected = true;
  }

  const estimatedAvoidedReship = Math.round(estimatedSavedShipments * reship);
  const errorCountForSupport = estimatesAreProjected
    ? Math.round(checked * (observedErrorRate > 0 ? observedErrorRate : ASSUMED_ADDRESS_ERROR_RATE))
    : errors;
  const estimatedAvoidedSupport = Math.round(errorCountForSupport * support);
  const estimatedSavedRevenue = Math.round(
    (estimatesAreProjected ? estimatedSavedShipments * 0.2 : blocked) * aov * 0.15 +
      estimatedAvoidedReship +
      estimatedAvoidedSupport,
  );
  const { countBillableUsage, sumBillableCharges } = await import("./billing.server");
  const [billable, usageCostFromRows] = await Promise.all([
    countBillableUsage(shop, from, to),
    sumBillableCharges(shop, from, to),
  ]);
  const pricePerOrder = getTierByHandle(settings?.planHandle).pricePerOrder;
  const usageCost = usageCostFromRows > 0 ? usageCostFromRows : billable * pricePerOrder;
  const roi = usageCost
    ? Math.round((estimatedSavedRevenue / usageCost) * 10) / 10
    : estimatedSavedRevenue
      ? Math.round((estimatedSavedRevenue / Math.max(checked * pricePerOrder, 0.01)) * 10) / 10
      : 0;
  const commonErrors = grouped.map((item) => ({
    type: item.errorType || "unknown",
    count: item._count.errorType,
    percent: errors ? Math.round((item._count.errorType / errors) * 100) : 0,
  }));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    total: checked,
    logged: total,
    ordersCount,
    valid,
    invalid,
    corrected,
    blocked,
    warnings,
    unavailable,
    autoFixed,
    manualFixed,
    held,
    review,
    errors,
    errorRate: errorRatePct,
    successRate,
    estimatedSavedShipments,
    estimatedAvoidedReship,
    estimatedAvoidedSupport,
    estimatedSavedRevenue,
    estimatesAreProjected,
    roi,
    commonErrors,
    recent,
  };
}

export async function listLogs(
  shop: string,
  preset: DatePreset,
  start: string | undefined,
  end: string | undefined,
  page = 1,
  pageSize = 20,
  errorType?: string,
) {
  const { from, to } = rangeFromPreset(preset, start, end);
  const where = {
    shop,
    createdAt: { gte: from, lte: to },
    ...(errorType ? { errorType } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.validationLog.count({ where }),
    prisma.validationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        checkoutRef: true,
        orderRef: true,
        country: true,
        originalAddress: true,
        correctedAddress: true,
        result: true,
        errorType: true,
        actionTaken: true,
        source: true,
        held: true,
      },
    }),
  ]);
  return { total, page, pageSize, rows, errorType: errorType || "" };
}

export const estimateSavings = calculateSavings;

export async function redactCustomer(shop: string, customerId?: string, orderIds?: string[]) {
  const filters = [];
  if (customerId) {
    // Also match rows hashed from the raw gid before ids were normalised.
    const hashes = [hashCustomerId(customerId), hashIdentifier(`gid://shopify/Customer/${customerKey(customerId)}`)];
    filters.push({ shop, customerId: { in: hashes.filter(Boolean) as string[] } });
  }
  if (orderIds?.length) {
    const refs = orderIds.flatMap((orderId) => {
      const numeric = String(orderId).match(/(\d+)$/)?.[1];
      return numeric
        ? [numeric, `gid://shopify/Order/${numeric}`, `gid://shopify/OrderIdentity/${numeric}`]
        : [String(orderId)];
    });
    filters.push({ shop, orderRef: { in: refs } });
  }
  if (!filters.length) return 0;
  const result = await prisma.validationLog.deleteMany({ where: { OR: filters } });
  return result.count;
}
