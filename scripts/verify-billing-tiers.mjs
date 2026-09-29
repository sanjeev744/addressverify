/**
 * Quick verification of tier resolution (no Shopify).
 * Run: node scripts/verify-billing-tiers.mjs
 */
const tiers = [
  { handle: "usage_tier_1", minOrders: 1, maxOrders: 500, pricePerOrder: 0.4 },
  { handle: "usage_tier_2", minOrders: 501, maxOrders: 1500, pricePerOrder: 0.3 },
  { handle: "usage_tier_3", minOrders: 1501, maxOrders: null, pricePerOrder: 0.2 },
];

function resolve(orderCount) {
  const count = Math.max(0, Math.floor(orderCount || 0));
  if (count === 0) return tiers[0];
  for (const tier of tiers) {
    const withinMin = count >= tier.minOrders;
    const withinMax = tier.maxOrders == null || count <= tier.maxOrders;
    if (withinMin && withinMax) return tier;
  }
  return tiers[tiers.length - 1];
}

const cases = [
  [0, "usage_tier_1", 0.4],
  [1, "usage_tier_1", 0.4],
  [500, "usage_tier_1", 0.4],
  [501, "usage_tier_2", 0.3],
  [1500, "usage_tier_2", 0.3],
  [1501, "usage_tier_3", 0.2],
  [99999, "usage_tier_3", 0.2],
];

let failed = 0;
for (const [count, handle, rate] of cases) {
  const tier = resolve(count);
  const ok = tier.handle === handle && tier.pricePerOrder === rate;
  console.log(ok ? "ok" : "FAIL", count, "→", tier.handle, tier.pricePerOrder);
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
