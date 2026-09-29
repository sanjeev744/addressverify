import { randomUUID } from "node:crypto";
import prisma from "../db.server";
import {
  BILLING_CONFIG,
  BILLING_TIERS,
  currentPeriodKey,
  getTierByHandle,
  isTestBillingEnabled,
  money,
  periodLabel,
  previousPeriodKey,
  resolveBillingTier,
  tierOrderRangeLabel,
  type BillingTier,
} from "../lib/plans";
import { logEvent } from "./monitor.server";

type BillingUsageRow = {
  id: string;
  shop: string;
  orderId: string;
  period: string;
  billable: boolean | number;
  chargeAmount: number;
  billingStatus: string;
  skipReason?: string | null;
  usageRecordId?: string | null;
};

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

function asBoolean(value: boolean | number | null | undefined) {
  return value === true || value === 1;
}

function isDuplicateError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "P2002" || message.includes("Duplicate entry") || message.includes("Unique constraint");
}

function serializeTier(tier: BillingTier) {
  return {
    handle: tier.handle,
    name: tier.name,
    minOrders: tier.minOrders,
    maxOrders: tier.maxOrders,
    pricePerOrder: tier.pricePerOrder,
    terms: tier.terms,
    rangeLabel: tierOrderRangeLabel(tier),
  };
}

async function findUsage(shop: string, orderId: string) {
  const rows = await prisma.$queryRaw<BillingUsageRow[]>`
    SELECT id, shop, orderId, period, billable, chargeAmount, billingStatus, skipReason, usageRecordId
    FROM billingusage
    WHERE shop = ${shop} AND orderId = ${orderId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function setUsageState(
  id: string,
  billingStatus: string,
  skipReason: string | null,
  extras?: { billable?: boolean; chargeAmount?: number; usageRecordId?: string | null },
) {
  await prisma.$executeRaw`
    UPDATE billingusage
    SET
      billingStatus = ${billingStatus},
      skipReason = ${skipReason},
      billable = ${extras?.billable == null ? 1 : extras.billable ? 1 : 0},
      chargeAmount = ${extras?.chargeAmount ?? 0},
      usageRecordId = ${extras?.usageRecordId ?? null}
    WHERE id = ${id}
  `;
}

async function incrementShopCounter(shop: string) {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const period = currentPeriodKey();
  const samePeriod = settings?.usageResetAt && currentPeriodKey(settings.usageResetAt) === period;
  await prisma.shopSettings.updateMany({
    where: { shop },
    data: samePeriod
      ? { monthlyValidations: { increment: 1 } }
      : { monthlyValidations: 1, usageResetAt: new Date() },
  });
}

async function activePlanPrice(shop: string) {
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
    select: { planHandle: true },
  });
  return getTierByHandle(settings?.planHandle).pricePerOrder;
}

export function normalizeOrderId(value?: string | number | null) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // Checkout UI extensions expose gid://shopify/OrderIdentity/<id>; the numeric id is the Order id.
  const gid = raw.match(/gid:\/\/shopify\/Order(?:Identity)?\/(\d+)/i);
  if (gid) return `gid://shopify/Order/${gid[1]}`;
  if (/^\d+$/.test(raw)) return `gid://shopify/Order/${raw}`;
  return null;
}

export function isProviderFailure(result?: { status?: string; errorTypes?: string[] } | null) {
  return result?.status === "unavailable" || Boolean(result?.errorTypes?.includes("service_unavailable"));
}

export async function getStoreOrderCount(admin: AdminClient, shop?: string) {
  if (shop) {
    const rows = await prisma.$queryRaw<Array<{ billingOrderCountOverride: number | null }>>`
      SELECT billingOrderCountOverride FROM shopsettings WHERE shop = ${shop} LIMIT 1
    `;
    const override = rows[0]?.billingOrderCountOverride;
    if (override != null && Number.isFinite(Number(override)) && Number(override) >= 0) {
      return Number(override);
    }
  }

  try {
    const response = await admin.graphql(
      `#graphql
        query AddressVerifyLifetimeOrdersCount {
          ordersCount { count }
        }
      `,
    );
    const json = await response.json();
    const count = json.data?.ordersCount?.count;
    if (typeof count === "number") return count;
  } catch (error) {
    console.warn("AddressVerify lifetime ordersCount failed", error);
  }

  try {
    const response = await admin.graphql(
      `#graphql
        query AddressVerifyOrdersPageFallback {
          orders(first: 250) {
            edges { node { id } }
          }
        }
      `,
    );
    const json = await response.json();
    return json.data?.orders?.edges?.length || 0;
  } catch (error) {
    console.warn("AddressVerify orders page fallback failed", error);
    return 0;
  }
}

export async function setBillingOrderCountOverride(shop: string, count: number | null) {
  await prisma.$executeRaw`
    UPDATE shopsettings
    SET billingOrderCountOverride = ${count}
    WHERE shop = ${shop}
  `;
}

/**
 * Resolve recommended tier from store order volume and detect subscription mismatch.
 * Does not change Shopify charges without merchant approval.
 */
export async function ensureBillingTier(shop: string, admin: AdminClient) {
  const storeOrderCount = await getStoreOrderCount(admin, shop);
  const recommendedTier = resolveBillingTier(storeOrderCount);
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const subscription = await getActiveUsageSubscription(admin);
  const persistedHandle =
    settings?.planHandle && settings.planHandle !== "usage"
      ? settings.planHandle
      : recommendedTier.handle;
  const activeTier = getTierByHandle(persistedHandle);

  if (!settings?.planHandle || settings.planHandle === "usage") {
    await prisma.shopSettings.updateMany({
      where: { shop },
      data: { planHandle: recommendedTier.handle },
    });
  }

  const needsApproval =
    !subscription.lineItemId || activeTier.handle !== recommendedTier.handle;

  return {
    storeOrderCount,
    activeTier: serializeTier(activeTier),
    recommendedTier: serializeTier(recommendedTier),
    needsApproval,
    planHandle: recommendedTier.handle,
    billingStatus: subscription.lineItemId ? "active" : settings?.billingStatus || "none",
    isTestBilling: isTestBillingEnabled(),
  };
}

function getActiveUsageSubscription(admin: AdminClient) {
  return admin
    .graphql(
      `#graphql
        query AddressVerifyActiveUsageSubscription {
          currentAppInstallation {
            activeSubscriptions {
              name
              status
              lineItems {
                id
                plan {
                  pricingDetails {
                    __typename
                    ... on AppUsagePricing {
                      terms
                      cappedAmount { amount currencyCode }
                    }
                  }
                }
              }
            }
          }
        }
      `,
    )
    .then(async (response) => {
      const json = await response.json();
      const subscriptions = json.data?.currentAppInstallation?.activeSubscriptions || [];
      const active = subscriptions.find((sub: { status?: string }) => sub.status === "ACTIVE") || subscriptions[0];
      const lineItem = (active?.lineItems || []).find(
        (item: { plan?: { pricingDetails?: { __typename?: string; terms?: string } } }) =>
          item.plan?.pricingDetails?.__typename === "AppUsagePricing",
      );
      const terms = lineItem?.plan?.pricingDetails?.terms || "";
      return {
        lineItemId: lineItem?.id as string | undefined,
        subscriptionName: active?.name as string | undefined,
        terms: terms as string,
        planNameMatches: (tier: BillingTier) =>
          Boolean(terms && (terms.includes(String(tier.pricePerOrder)) || terms.includes(tier.name))),
      };
    })
    .catch(() => ({
      lineItemId: undefined as string | undefined,
      subscriptionName: undefined as string | undefined,
      terms: "",
      planNameMatches: () => false,
    }));
}

export async function recordBillableOrder(input: {
  shop: string;
  orderId?: string | number | null;
  source?: string;
  result?: { status?: string; errorTypes?: string[] } | null;
  admin?: AdminClient;
  shopId?: string | null;
}) {
  const orderId = normalizeOrderId(input.orderId);
  if (!orderId) {
    return { billed: false, reason: "missing_order_id" as const };
  }
  if (input.source === "test") {
    return { billed: false, reason: "test_address" as const };
  }

  const period = currentPeriodKey();
  const providerFailed = isProviderFailure(input.result);
  const billable = !providerFailed;
  const pricePerOrder = await activePlanPrice(input.shop);
  const chargeAmount = billable ? pricePerOrder : 0;
  const existing = await findUsage(input.shop, orderId);

  if (existing) {
    if (!asBoolean(existing.billable) && existing.skipReason === "provider_error" && billable) {
      await setUsageState(existing.id, "pending", null, {
        billable: true,
        chargeAmount,
        usageRecordId: existing.usageRecordId,
      });
      await incrementShopCounter(input.shop);
      if (input.admin) {
        await reportUsageToShopify(input.shop, existing.id, orderId, input.admin, chargeAmount);
      }
      return { billed: true, reason: "charged" as const, record: existing };
    }

    if (
      asBoolean(existing.billable) &&
      input.admin &&
      (existing.billingStatus === "pending" || existing.billingStatus === "failed")
    ) {
      await reportUsageToShopify(
        input.shop,
        existing.id,
        orderId,
        input.admin,
        Number(existing.chargeAmount) || chargeAmount,
      );
    }

    return { billed: false, reason: "duplicate" as const, record: existing };
  }

  const id = randomUUID();
  try {
    const inserted = await prisma.$executeRaw`
      INSERT INTO billingusage (
        id, shop, shopId, orderId, period, validatedAt, billable, chargeAmount, billingStatus, skipReason, source, createdAt
      )
      SELECT
        ${id},
        ${input.shop},
        ${input.shopId || null},
        ${orderId},
        ${period},
        NOW(3),
        ${billable ? 1 : 0},
        ${chargeAmount},
        ${billable ? "pending" : "skipped"},
        ${providerFailed ? "provider_error" : null},
        ${input.source || "order"},
        NOW(3)
      FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1 FROM billingusage WHERE shop = ${input.shop} AND orderId = ${orderId}
      )
    `;
    if (!inserted) {
      const raced = await findUsage(input.shop, orderId);
      return { billed: false, reason: "duplicate" as const, record: raced };
    }
  } catch (error) {
    if (isDuplicateError(error)) {
      const raced = await findUsage(input.shop, orderId);
      return { billed: false, reason: "duplicate" as const, record: raced };
    }
    throw error;
  }

  const record = (await findUsage(input.shop, orderId)) || {
    id,
    shop: input.shop,
    orderId,
    period,
    billable,
    chargeAmount,
    billingStatus: billable ? "pending" : "skipped",
    skipReason: providerFailed ? "provider_error" : null,
  };

  if (!billable) {
    return { billed: false, reason: "provider_error" as const, record };
  }

  await incrementShopCounter(input.shop);

  if (input.admin) {
    await reportUsageToShopify(input.shop, record.id, orderId, input.admin, chargeAmount);
  }

  return { billed: true, reason: "charged" as const, record };
}

export async function reportUsageToShopify(
  shop: string,
  usageId: string,
  orderId: string,
  admin: AdminClient,
  chargeAmount?: number,
) {
  const lineItemId = (await getShopBillingMeta(shop)).usageLineItemId || (await refreshUsageLineItem(shop, admin));
  if (!lineItemId) {
    await prisma.$executeRaw`
      UPDATE billingusage
      SET billingStatus = ${"pending"}, skipReason = ${"subscription_missing"}
      WHERE id = ${usageId}
    `;
    return;
  }

  const usageRow = await findUsage(shop, orderId);
  const amount =
    typeof chargeAmount === "number" && chargeAmount > 0
      ? chargeAmount
      : Number(usageRow?.chargeAmount) > 0
        ? Number(usageRow?.chargeAmount)
        : await activePlanPrice(shop);

  try {
    const response = await admin.graphql(
      `#graphql
        mutation AddressVerifyUsageRecord($description: String!, $price: MoneyInput!, $subscriptionLineItemId: ID!, $idempotencyKey: String) {
          appUsageRecordCreate(
            description: $description
            price: $price
            subscriptionLineItemId: $subscriptionLineItemId
            idempotencyKey: $idempotencyKey
          ) {
            appUsageRecord { id }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          description: `AddressVerify order ${orderId}`,
          price: {
            amount,
            currencyCode: BILLING_CONFIG.currencyCode,
          },
          subscriptionLineItemId: lineItemId,
          idempotencyKey: `${shop}:${orderId}`,
        },
      },
    );
    const json = await response.json();
    const errors = json.data?.appUsageRecordCreate?.userErrors || [];
    const usageRecordId = json.data?.appUsageRecordCreate?.appUsageRecord?.id;
    if (errors.length || !usageRecordId) {
      await prisma.$executeRaw`
        UPDATE billingusage
        SET billingStatus = ${"failed"}, skipReason = ${errors[0]?.message || "usage_record_failed"}
        WHERE id = ${usageId}
      `;
      await logEvent(shop, "warn", "Shopify usage record failed", errors);
      return;
    }
    await prisma.$executeRaw`
      UPDATE billingusage
      SET billingStatus = ${"reported"}, skipReason = NULL, usageRecordId = ${usageRecordId}
      WHERE id = ${usageId}
    `;
  } catch (error) {
    await prisma.$executeRaw`
      UPDATE billingusage
      SET billingStatus = ${"failed"},
          skipReason = ${error instanceof Error ? error.message : "usage_record_error"}
      WHERE id = ${usageId}
    `;
  }
}

export async function getShopBillingMeta(shop: string) {
  const rows = await prisma.$queryRaw<Array<{ shopGid?: string | null; usageLineItemId?: string | null }>>`
    SELECT shopGid, usageLineItemId FROM shopsettings WHERE shop = ${shop} LIMIT 1
  `;
  return {
    shopGid: rows[0]?.shopGid || null,
    usageLineItemId: rows[0]?.usageLineItemId || null,
  };
}

export async function refreshUsageLineItem(shop: string, admin: AdminClient, _planHandle?: string) {
  const response = await admin.graphql(
    `#graphql
      query AddressVerifyBilling {
        shop { id }
        currentAppInstallation {
          activeSubscriptions {
            name
            status
            lineItems {
              id
              plan {
                pricingDetails {
                  __typename
                  ... on AppUsagePricing {
                    terms
                    cappedAmount { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    `,
  );
  const json = await response.json();
  const shopGid = json.data?.shop?.id as string | undefined;
  const subscriptions = json.data?.currentAppInstallation?.activeSubscriptions || [];
  const lineItem = subscriptions
    .flatMap(
      (subscription: {
        lineItems?: Array<{ id: string; plan?: { pricingDetails?: { __typename?: string } } }>;
      }) => subscription.lineItems || [],
    )
    .find(
      (item: { plan?: { pricingDetails?: { __typename?: string } } }) =>
        item.plan?.pricingDetails?.__typename === "AppUsagePricing",
    );

  await prisma.$executeRaw`
    UPDATE shopsettings
    SET
      shopGid = ${shopGid || null},
      usageLineItemId = ${lineItem?.id || null},
      billingStatus = ${lineItem?.id ? "active" : "none"}
    WHERE shop = ${shop}
  `;
  // The per-order price must match the subscription the merchant approved (subscription name = plan handle).
  const approvedTier = BILLING_TIERS.find((tier) =>
    subscriptions.some(
      (subscription: { name?: string; status?: string }) =>
        subscription.status === "ACTIVE" && subscription.name === tier.handle,
    ),
  );
  if (approvedTier) {
    await prisma.shopSettings.updateMany({
      where: { shop, planHandle: { not: approvedTier.handle } },
      data: { planHandle: approvedTier.handle },
    });
  }
  return lineItem?.id as string | undefined;
}

export async function activateBillingPlan(shop: string, planHandle: string) {
  const tier = getTierByHandle(planHandle);
  await prisma.shopSettings.updateMany({
    where: { shop },
    data: { planHandle: tier.handle },
  });
  return tier;
}

export async function countBillableUsage(shop: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*) AS total
    FROM billingusage
    WHERE shop = ${shop}
      AND billable = 1
      AND validatedAt >= ${from}
      AND validatedAt <= ${to}
  `;
  return Number(rows[0]?.total || 0);
}

export async function sumBillableCharges(shop: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT SUM(chargeAmount) AS total
    FROM billingusage
    WHERE shop = ${shop}
      AND billable = 1
      AND validatedAt >= ${from}
      AND validatedAt <= ${to}
  `;
  return Number(rows[0]?.total || 0);
}

export async function deleteBillingUsage(shop: string) {
  await prisma.$executeRaw`DELETE FROM billingusage WHERE shop = ${shop}`;
}

export async function getBillingSummary(shop: string, admin?: AdminClient) {
  const period = currentPeriodKey();
  const previous = previousPeriodKey();
  const [currentRows, previousRows, history, settings] = await Promise.all([
    prisma.$queryRaw<BillingUsageRow[]>`
      SELECT id, shop, orderId, period, billable, chargeAmount, billingStatus
      FROM billingusage
      WHERE shop = ${shop} AND period = ${period}
    `,
    prisma.$queryRaw<BillingUsageRow[]>`
      SELECT id, shop, orderId, period, billable, chargeAmount, billingStatus
      FROM billingusage
      WHERE shop = ${shop} AND period = ${previous}
    `,
    prisma.$queryRaw<Array<{ period: string; processed: bigint | number; estimated: number | null }>>`
      SELECT period, COUNT(orderId) AS processed, SUM(chargeAmount) AS estimated
      FROM billingusage
      WHERE shop = ${shop}
      GROUP BY period
      ORDER BY period DESC
      LIMIT 12
    `,
    prisma.shopSettings.findUnique({ where: { shop } }),
  ]);

  let orderCountOverride: number | null = null;
  try {
    const overrideRows = await prisma.$queryRaw<Array<{ billingOrderCountOverride: number | null }>>`
      SELECT billingOrderCountOverride FROM shopsettings WHERE shop = ${shop} LIMIT 1
    `;
    orderCountOverride = overrideRows[0]?.billingOrderCountOverride ?? null;
  } catch {
    orderCountOverride = null;
  }

  let storeOrderCount = 0;
  let tierInfo = {
    storeOrderCount: 0,
    activeTier: serializeTier(getTierByHandle(settings?.planHandle)),
    recommendedTier: serializeTier(getTierByHandle(settings?.planHandle)),
    needsApproval: settings?.billingStatus !== "active",
    planHandle: getTierByHandle(settings?.planHandle).handle,
    billingStatus: settings?.billingStatus || "none",
    isTestBilling: isTestBillingEnabled(),
  };

  if (admin) {
    try {
      tierInfo = await ensureBillingTier(shop, admin);
      storeOrderCount = tierInfo.storeOrderCount;
    } catch (error) {
      console.warn("AddressVerify ensureBillingTier skipped", error);
      storeOrderCount = await getStoreOrderCount(admin, shop).catch(() => 0);
      tierInfo.recommendedTier = serializeTier(resolveBillingTier(storeOrderCount));
      tierInfo.storeOrderCount = storeOrderCount;
    }
  }

  const activeTier = tierInfo.activeTier;
  const pricePerOrder = activeTier.pricePerOrder;

  let processed = currentRows.length;
  let billable = currentRows.filter((row) => asBoolean(row.billable)).length;
  let estimated = currentRows
    .filter((row) => asBoolean(row.billable))
    .reduce((sum, row) => sum + Number(row.chargeAmount || 0), 0);
  let estimateIsProjected = false;

  // If rows exist but chargeAmount was written as 0 under old pricing, fall back to rate × count.
  if (billable > 0 && estimated === 0) {
    estimated = billable * pricePerOrder;
  }

  // When no usage rows yet, project this period's charge from Shopify order volume.
  if (billable === 0 && admin) {
    try {
      const { getOrdersCountInRange } = await import("./shopify-sync.server");
      const [year, month] = period.split("-").map(Number);
      const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      const periodOrders = await getOrdersCountInRange(admin, from, to);
      if (periodOrders > 0) {
        processed = Math.max(processed, periodOrders);
        billable = periodOrders;
        estimated = Math.round(periodOrders * pricePerOrder * 100) / 100;
        estimateIsProjected = true;
      }
    } catch (error) {
      console.warn("AddressVerify billing estimate fallback skipped", error);
    }
  }

  const previousBillable = previousRows.filter((row) => asBoolean(row.billable)).length;
  const previousAmount = previousRows
    .filter((row) => asBoolean(row.billable))
    .reduce((sum, row) => sum + Number(row.chargeAmount || pricePerOrder), 0);

  return {
    period,
    periodLabel: periodLabel(period),
    previousPeriod: previous,
    previousPeriodLabel: periodLabel(previous),
    processed,
    billable,
    pricePerOrder,
    estimated,
    estimatedFormatted: money(estimated),
    estimateIsProjected,
    previousAmount,
    previousFormatted: money(previousAmount),
    billingStatus: tierInfo.billingStatus || settings?.billingStatus || "none",
    terms: activeTier.terms,
    storeOrderCount: tierInfo.storeOrderCount,
    activeTier,
    recommendedTier: tierInfo.recommendedTier,
    needsPlanSwitch: tierInfo.activeTier.handle !== tierInfo.recommendedTier.handle,
    needsApproval: tierInfo.needsApproval,
    isTestBilling: tierInfo.isTestBilling,
    orderCountOverride,
    tiers: BILLING_TIERS.map(serializeTier),
    history: history.map((row) => ({
      period: row.period,
      label: periodLabel(row.period),
      processed: Number(row.processed || 0),
      estimated: Number(row.estimated || 0),
    })),
  };
}
