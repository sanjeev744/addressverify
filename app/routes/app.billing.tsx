import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Card,
  DataTable,
  Text,
} from "@shopify/polaris";
import { AppPage } from "../components/AppPage";
import { BillingPlanCards, BillingSummaryStrip } from "../components/BillingPlanCards";
import { getTierByHandle, isTestBillingEnabled, money } from "../lib/plans";
import {
  getBillingSummary,
  refreshUsageLineItem,
} from "../services/billing.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  try {
    await refreshUsageLineItem(session.shop, admin);
  } catch {
    // Subscription may not be approved yet.
  }
  try {
    const { syncOrdersIntoAnalytics } = await import("../services/analytics-sync.server");
    await syncOrdersIntoAnalytics(session.shop, admin, "30d");
  } catch (error) {
    console.warn("AddressVerify billing sync skipped", error);
  }
  const summary = await getBillingSummary(session.shop, admin);
  return { summary };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);
  const form = await request.formData();
  const planHandle = String(form.get("planHandle") || "").trim();
  const summary = await getBillingSummary(session.shop, admin);
  // Only known tiers can be requested. planHandle is persisted once Shopify reports the
  // subscription as approved (refreshUsageLineItem), not before the merchant confirms.
  const targetHandle = getTierByHandle(planHandle || summary.recommendedTier.handle).handle;
  await billing.request({
    plan: targetHandle as never,
    isTest: isTestBillingEnabled(),
    returnUrl: `${process.env.SHOPIFY_APP_URL || ""}/app/billing`,
  });
  return null;
};

export default function BillingPage() {
  const { summary } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <AppPage
      title="Billing"
      subtitle="Pick the plan that matches your store’s order volume. You only pay per unique order AddressVerify processes."
    >
      <BlockStack gap="500">
        {summary.isTestBilling ? (
          <Banner title="Test billing is enabled" tone="info">
            <p>
              Shopify test charges are used in development. Force test mode anytime with{" "}
              <code>SHOPIFY_BILLING_TEST=1</code>.
            </p>
          </Banner>
        ) : null}

        {summary.needsPlanSwitch || summary.needsApproval ? (
          <Banner title={`Recommended for your store: ${summary.recommendedTier.name}`} tone="warning">
            <p>
              You have {summary.storeOrderCount.toLocaleString()} store orders, so{" "}
              <strong>{summary.recommendedTier.name}</strong> at{" "}
              {money(summary.recommendedTier.pricePerOrder)} / order is the best fit. Approve it from the plan
              cards below.
            </p>
          </Banner>
        ) : (
          <Banner title={`${summary.activeTier.name} is active`} tone="success">
            <p>
              You’re on {money(summary.activeTier.pricePerOrder)} / order for{" "}
              {summary.activeTier.rangeLabel.toLowerCase()}. Each unique Shopify order is charged once.
            </p>
          </Banner>
        )}

        <BillingSummaryStrip
          storeOrderCount={summary.storeOrderCount}
          periodLabel={summary.periodLabel}
          billable={summary.billable}
          estimatedFormatted={summary.estimatedFormatted}
          pricePerOrder={summary.pricePerOrder}
          activeTierName={summary.activeTier.name}
          overrideActive={summary.orderCountOverride != null}
          estimateIsProjected={summary.estimateIsProjected}
        />

        <BlockStack gap="300">
          <BlockStack gap="100">
            <Text as="h2" variant="headingLg">
              Choose your plan
            </Text>
            <Text as="p" tone="subdued">
              Plans are selected from your store’s lifetime order count. When you grow into a new range, switch
              plans to unlock the lower rate.
            </Text>
          </BlockStack>
          <BillingPlanCards
            tiers={summary.tiers}
            activeHandle={summary.activeTier.handle}
            recommendedHandle={summary.recommendedTier.handle}
            busy={busy}
          />
        </BlockStack>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Billing history
            </Text>
            {summary.history.length ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric"]}
                headings={["Period", "Orders processed", "Estimated amount"]}
                rows={summary.history.map((row: { label: string; processed: number; estimated: number }) => [
                  row.label,
                  row.processed,
                  money(row.estimated),
                ])}
              />
            ) : (
              <Text as="p" tone="subdued">
                No billed orders yet. Admin test addresses are never charged.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </AppPage>
  );
}
