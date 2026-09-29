import { getTierByHandle, resolveBillingTier } from "./plans";

export function estimateSavings(input: {
  monthlyOrders: number;
  averageOrderValue: number;
  errorRate: number;
  reshipCost: number;
  supportCost: number;
  correctionRate: number;
  /** Optional override; defaults to tier rate for the given monthly order volume. */
  pricePerOrder?: number;
}) {
  const monthlyErrors = Math.round(input.monthlyOrders * (input.errorRate / 100));
  const prevented = Math.round(monthlyErrors * (input.correctionRate / 100));
  const savedShipping = Math.round(prevented * input.reshipCost);
  const savedSupport = Math.round(monthlyErrors * input.supportCost);
  const total = savedShipping + savedSupport;
  const pricePerOrder =
    input.pricePerOrder ??
    resolveBillingTier(input.monthlyOrders).pricePerOrder ??
    getTierByHandle(null).pricePerOrder;
  const usageCost = Math.round(input.monthlyOrders * pricePerOrder * 100) / 100;
  return {
    monthlyErrors,
    prevented,
    savedShipping,
    savedSupport,
    total,
    usageCost,
    pricePerOrder,
    roi: usageCost ? Math.round((total / usageCost) * 10) / 10 : 0,
  };
}

export function holdTitle(orderName: string) {
  return `${orderName} — Address incorrect`;
}
