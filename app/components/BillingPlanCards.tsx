import {
  Badge,
  BlockStack,
  Box,
  Button,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";

export type BillingPlanTierView = {
  handle: string;
  name: string;
  minOrders: number;
  maxOrders: number | null;
  pricePerOrder: number;
  terms: string;
  rangeLabel: string;
};

type Props = {
  tiers: BillingPlanTierView[];
  activeHandle: string;
  recommendedHandle: string;
  busy?: boolean;
};

const TIER_BLURBS: Record<string, string> = {
  usage_tier_1: "Best for new and growing stores validating every order.",
  usage_tier_2: "Lower rate as your order volume scales past 500.",
  usage_tier_3: "Our best per-order rate for high-volume merchants.",
};

const TIER_FEATURES = [
  "Charged once per unique order",
  "Checkout + post-checkout included",
  "No monthly subscription fee",
];

export function BillingPlanCards({ tiers, activeHandle, recommendedHandle, busy }: Props) {
  return (
    <div className="av-plan-grid">
    <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">
      {tiers.map((tier) => {
        const isActive = tier.handle === activeHandle;
        const isRecommended = tier.handle === recommendedHandle;
        const featured = isRecommended;

        return (
          <div
            key={tier.handle}
            className="av-plan-card"
            style={{
              height: "100%",
              borderRadius: "12px",
              outline: featured
                ? "2px solid var(--p-color-border-emphasis, #005bd3)"
                : "1px solid var(--p-color-border-secondary, #e3e3e3)",
              boxShadow: featured ? "0 10px 28px rgba(15, 23, 42, 0.08)" : "0 1px 2px rgba(15, 23, 42, 0.04)",
              overflow: "hidden",
              background: featured
                ? "linear-gradient(165deg, rgba(0, 128, 96, 0.08) 0%, #fff 38%)"
                : "#fff",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="start" wrap gap="200">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingMd">
                      {tier.name}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {tier.rangeLabel}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="100" wrap>
                    {isActive ? <Badge tone="success">Active</Badge> : null}
                    {isRecommended ? <Badge tone="info">Recommended</Badge> : null}
                    {tier.handle === "usage_tier_3" && !isRecommended ? (
                      <Badge>Best value</Badge>
                    ) : null}
                  </InlineStack>
                </InlineStack>

                <BlockStack gap="100">
                  <InlineStack gap="100" blockAlign="end">
                    <span
                      style={{
                        fontSize: "2.25rem",
                        lineHeight: 1,
                        fontWeight: 700,
                        letterSpacing: "-0.03em",
                        color: "var(--p-color-text, #202223)",
                      }}
                    >
                      ${tier.pricePerOrder.toFixed(2)}
                    </span>
                    <Text as="span" tone="subdued" variant="bodyMd">
                      / order
                    </Text>
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {TIER_BLURBS[tier.handle] || tier.terms}
                  </Text>
                </BlockStack>

                <BlockStack gap="150">
                  {TIER_FEATURES.map((feature) => (
                    <InlineStack key={feature} gap="200" blockAlign="start">
                      <span
                        aria-hidden
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "rgba(0, 128, 96, 0.12)",
                          color: "#008060",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        ✓
                      </span>
                      <Text as="span" variant="bodySm">
                        {feature}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>

                <Box paddingBlockStart="200">
                  {isActive && !isRecommended ? (
                    <Button fullWidth disabled>
                      Current plan
                    </Button>
                  ) : (
                    <form method="post">
                      <input type="hidden" name="intent" value="approve" />
                      <input type="hidden" name="planHandle" value={tier.handle} />
                      <Button
                        submit
                        fullWidth
                        variant={isRecommended || isActive ? "primary" : "secondary"}
                        loading={busy}
                      >
                        {isActive && isRecommended
                          ? "Review in Shopify"
                          : isRecommended
                            ? `Approve ${tier.name}`
                            : `Switch to ${tier.name}`}
                      </Button>
                    </form>
                  )}
                </Box>
              </BlockStack>
            </Box>
          </div>
        );
      })}
    </InlineGrid>
    </div>
  );
}

export function BillingSummaryStrip({
  storeOrderCount,
  periodLabel,
  billable,
  estimatedFormatted,
  pricePerOrder,
  activeTierName,
  overrideActive,
  estimateIsProjected,
}: {
  storeOrderCount: number;
  periodLabel: string;
  billable: number;
  estimatedFormatted: string;
  pricePerOrder: number;
  activeTierName: string;
  overrideActive?: boolean;
  estimateIsProjected?: boolean;
}) {
  const items = [
    {
      label: "Store orders",
      value: storeOrderCount.toLocaleString(),
      hint: overrideActive ? "Test override on" : "Lifetime Shopify volume",
    },
    {
      label: "Active plan",
      value: activeTierName,
      hint: `$${pricePerOrder.toFixed(2)} / order`,
    },
    {
      label: "This period",
      value: periodLabel,
      hint: `${billable.toLocaleString()} billable`,
    },
    {
      label: "Estimated charge",
      value: estimatedFormatted,
      hint: estimateIsProjected
        ? `${billable.toLocaleString()} × $${pricePerOrder.toFixed(2)} (projected)`
        : `${billable.toLocaleString()} × $${pricePerOrder.toFixed(2)}`,
    },
  ];

  return (
    <div
      className="av-summary-strip"
      style={{
        borderRadius: 12,
        border: "1px solid var(--p-color-border-secondary, #e3e3e3)",
        background: "linear-gradient(135deg, #f6faf8 0%, #ffffff 55%)",
        overflow: "hidden",
      }}
    >
      <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="0">
        {items.map((item, index) => (
          <div
            key={item.label}
            style={{
              padding: "1.1rem 1.25rem",
              borderRight: index < items.length - 1 ? "1px solid var(--p-color-border-secondary, #e3e3e3)" : undefined,
            }}
          >
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">
                {item.label}
              </Text>
              <Text as="p" variant="headingLg" fontWeight="semibold">
                {item.value}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {item.hint}
              </Text>
            </BlockStack>
          </div>
        ))}
      </InlineGrid>
    </div>
  );
}
