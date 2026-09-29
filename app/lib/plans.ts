import catalog from "../config/billing.json";

export type BillingTier = {
  handle: string;
  name: string;
  minOrders: number;
  maxOrders: number | null;
  pricePerOrder: number;
  terms: string;
};

export type PlanDefinition = {
  handle: string;
  name: string;
  description: string;
  amount: number | null;
  currencyCode: string;
  interval: "every_30_days" | "annual" | "usage";
  trialDays: number;
  monthlyValidations: number | null;
  usageCappedAmount?: number;
  usageTerms?: string;
  contactSales?: boolean;
  supportTier: "standard" | "priority" | "guided" | "dedicated";
  features: string[];
  minOrders?: number;
  maxOrders?: number | null;
  pricePerOrder?: number;
};

export const BILLING_TIERS: BillingTier[] = catalog.tiers.map((tier) => ({
  handle: tier.handle,
  name: tier.name,
  minOrders: tier.minOrders,
  maxOrders: tier.maxOrders,
  pricePerOrder: tier.pricePerOrder,
  terms: tier.terms,
}));

/** @deprecated Prefer BILLING_TIERS / getTierByHandle — kept for gradual migration. */
export const BILLING_CONFIG = {
  currencyCode: catalog.currencyCode,
  cappedAmount: catalog.cappedAmount,
  trialDays: catalog.trialDays,
  supportTier: catalog.supportTier,
  features: catalog.features as string[],
  pricePerOrder: BILLING_TIERS[0].pricePerOrder,
  terms: BILLING_TIERS[0].terms,
  planHandle: BILLING_TIERS[0].handle,
  planName: BILLING_TIERS[0].name,
};

/** Default / fallback plan handle (tier 1). */
export const USAGE_PLAN_HANDLE = BILLING_TIERS[0].handle;

export const PLAN_CATALOG: PlanDefinition[] = BILLING_TIERS.map((tier) => ({
  handle: tier.handle,
  name: tier.name,
  description: tier.terms,
  amount: null,
  currencyCode: catalog.currencyCode,
  interval: "usage" as const,
  trialDays: catalog.trialDays,
  monthlyValidations: null,
  usageCappedAmount: catalog.cappedAmount,
  usageTerms: tier.terms,
  supportTier: catalog.supportTier as PlanDefinition["supportTier"],
  features: catalog.features as string[],
  minOrders: tier.minOrders,
  maxOrders: tier.maxOrders,
  pricePerOrder: tier.pricePerOrder,
}));

export function getTierByHandle(handle?: string | null): BillingTier {
  return BILLING_TIERS.find((tier) => tier.handle === handle) || BILLING_TIERS[0];
}

export function resolveBillingTier(orderCount: number): BillingTier {
  const count = Math.max(0, Math.floor(orderCount || 0));
  if (count === 0) return BILLING_TIERS[0];
  for (const tier of BILLING_TIERS) {
    const withinMin = count >= tier.minOrders;
    const withinMax = tier.maxOrders == null || count <= tier.maxOrders;
    if (withinMin && withinMax) return tier;
  }
  return BILLING_TIERS[BILLING_TIERS.length - 1];
}

export function tierOrderRangeLabel(tier: BillingTier) {
  if (tier.maxOrders == null) {
    return `${tier.minOrders.toLocaleString()}+ orders`;
  }
  return `${tier.minOrders.toLocaleString()}–${tier.maxOrders.toLocaleString()} orders`;
}

export function getPlan(handle?: string | null) {
  return PLAN_CATALOG.find((plan) => plan.handle === handle) || PLAN_CATALOG[0];
}

export function planAllows(handle: string | null | undefined, feature: string) {
  const plan = getPlan(handle);
  return plan.features.includes("*") || plan.features.includes(feature);
}

export function formatPlanPrice(planOrTier?: PlanDefinition | BillingTier | string | null) {
  const tier =
    typeof planOrTier === "string" || planOrTier == null
      ? getTierByHandle(planOrTier)
      : "pricePerOrder" in planOrTier && typeof planOrTier.pricePerOrder === "number"
        ? ("handle" in planOrTier && "minOrders" in planOrTier
            ? (planOrTier as BillingTier)
            : getTierByHandle((planOrTier as PlanDefinition).handle))
        : getTierByHandle((planOrTier as PlanDefinition).handle);
  return `$${tier.pricePerOrder.toFixed(2)} / order`;
}

export function isTestBillingEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SHOPIFY_BILLING_TEST === "1";
}

export function currentPeriodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function previousPeriodKey(date = new Date()) {
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return currentPeriodKey(previous);
}

export function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function money(amount: number) {
  return `$${amount.toFixed(2)}`;
}
