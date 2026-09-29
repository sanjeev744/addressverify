import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Icon,
  Tooltip,
} from "@shopify/polaris";
import {
  ArrowDiagonalIcon,
  CashDollarIcon,
  CheckCircleIcon,
  EditIcon,
  FileIcon,
  InfoIcon,
  QuestionCircleIcon,
  XCircleIcon,
} from "@shopify/polaris-icons";
import { StatCard } from "../components/StatCard";
import { AppPage } from "../components/AppPage";
import { parseDateQuery } from "../lib/date-query";
import { ERROR_TYPE_LABELS } from "../lib/defaults";
import { money } from "../lib/plans";
import { getBillingSummary } from "../services/billing.server";
import { getAnalytics } from "../services/logs.server";
import { ensureShopDefaults } from "../services/shop.server";
import { authenticate } from "../shopify.server";
import dashboardStyles from "../styles/dashboard.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: dashboardStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = parseDateQuery(url);
  const bundle = await ensureShopDefaults(session.shop);
  try {
    const { syncOrdersIntoAnalytics } = await import("../services/analytics-sync.server");
    await syncOrdersIntoAnalytics(session.shop, admin, query.preset, query.start, query.end);
  } catch (error) {
    console.warn("AddressVerify dashboard analytics sync skipped", error);
  }
  const [analytics, billing] = await Promise.all([
    getAnalytics(session.shop, query.preset, query.start, query.end, admin),
    getBillingSummary(session.shop, admin),
  ]);
  return {
    analytics,
    settings: bundle.settings,
    billing,
  };
};

function formatLogWhen(iso: string) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}

function statusLabel(result: string) {
  if (!result) return "Unknown";
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function statusTone(result: string): "success" | "critical" | "warning" | "info" | undefined {
  if (result === "invalid") return "critical";
  if (result === "warning" || result === "unavailable") return "warning";
  if (result === "corrected") return "success";
  if (result === "valid") return "success";
  return "success";
}

function actionLabel(actionTaken: string | null | undefined, result: string) {
  if (actionTaken === "fix" || result === "corrected") return "Address corrected";
  if (actionTaken === "block" || actionTaken === "review" || result === "invalid") {
    return "Flagged for review";
  }
  if (actionTaken === "warn") return "Warned customer";
  return "No action needed";
}

function orderLabel(row: {
  orderRef?: string | null;
  checkoutRef?: string | null;
  id: string;
}) {
  const ref = row.orderRef || row.checkoutRef;
  if (!ref) return `#${row.id.slice(-5)}`;
  if (ref.startsWith("#")) return ref;
  if (/^\d+$/.test(ref)) return `#${ref}`;
  return ref;
}

export default function Dashboard() {
  const { analytics, settings, billing } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  const ordersProcessed = Math.max(billing.processed || 0, analytics.total || 0);
  const billableOrders = billing.billable || 0;
  const priceLabel = `${money(billing.pricePerOrder)} / order`;

  const stats = [
    {
      label: "Addresses checked",
      value: analytics.total,
      icon: FileIcon,
      iconTone: "info" as const,
    },
    {
      label: "Valid addresses",
      value: analytics.valid,
      tone: "success" as const,
      icon: CheckCircleIcon,
      iconTone: "success" as const,
    },
    {
      label: "Invalid addresses",
      value: analytics.invalid,
      tone: "critical" as const,
      icon: XCircleIcon,
      iconTone: "critical" as const,
    },
    {
      label: "Addresses corrected",
      value: analytics.corrected,
      tone: "info" as const,
      icon: EditIcon,
      iconTone: "info" as const,
    },
    {
      label: "Validation success rate",
      value: `${analytics.successRate}%`,
      tone: "success" as const,
      icon: ArrowDiagonalIcon,
      iconTone: "success" as const,
    },
    {
      label: "Estimated saved revenue",
      value: `$${analytics.estimatedSavedRevenue.toLocaleString()}`,
      tone: "success" as const,
      icon: CashDollarIcon,
      iconTone: "success" as const,
    },
  ];

  return (
    <AppPage
      title="AddressVerify"
      subtitle="Verify and correct addresses to reduce shipping errors and improve delivery success."
      titleMetadata={
        <Tooltip content="Help & support">
          <Button
            icon={QuestionCircleIcon}
            variant="plain"
            accessibilityLabel="Help"
            url="/app/help"
          />
        </Tooltip>
      }
    >
      <div className="av-dash">
        <BlockStack gap="400">
          {!settings.onboarded ? (
            <Banner title="Finish setup" tone="info" action={{ content: "Open setup", url: "/app/setup" }}>
              <p>
                Add AddressVerify to Thank You and Order Status, turn on in-checkout validation, set tags, then
                save.
              </p>
            </Banner>
          ) : null}
          {!settings.validationEnabled ? (
            <Banner
              title="Validation is turned off"
              tone="warning"
              action={{ content: "Enable in settings", url: "/app/settings" }}
            >
              <p>Customers can currently complete checkout without AddressVerify checks.</p>
            </Banner>
          ) : null}

          <div className="av-dash__card">
            <div className="av-dash__card-header">
              <h2 className="av-dash__card-title">Usage billing · {billing.periodLabel}</h2>
              <Button url="/app/billing">View usage history</Button>
            </div>
            <div className="av-dash__billing-grid">
              <div className="av-dash__billing-item">
                <span className="av-dash__billing-label">Orders processed</span>
                <strong className="av-dash__billing-value">{ordersProcessed.toLocaleString()}</strong>
                <span className="av-dash__billing-hint">Total orders processed</span>
              </div>
              <div className="av-dash__billing-item">
                <span className="av-dash__billing-label">Billable orders</span>
                <strong className="av-dash__billing-value">{billableOrders.toLocaleString()}</strong>
                <span className="av-dash__billing-hint">Orders eligible for billing</span>
              </div>
              <div className="av-dash__billing-item">
                <span className="av-dash__billing-label">Price</span>
                <strong className="av-dash__billing-value">{priceLabel}</strong>
                <span className="av-dash__billing-hint">Per billable order</span>
              </div>
              <div className="av-dash__billing-item">
                <span className="av-dash__billing-label">Estimated cost</span>
                <strong className="av-dash__billing-value av-dash__billing-value--green">
                  {billing.estimatedFormatted}
                </strong>
                <span className="av-dash__billing-hint">Based on billable orders</span>
              </div>
            </div>
          </div>

          <div className="av-dash__metrics">
            {stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                tone={stat.tone}
                icon={stat.icon}
                iconTone={stat.iconTone}
              />
            ))}
          </div>

          <div className="av-dash__card">
            <div className="av-dash__card-header">
              <h2 className="av-dash__card-title">
                Recent logs
                <Tooltip content="Latest checkout and test validations">
                  <span>
                    <Icon source={InfoIcon} tone="subdued" />
                  </span>
                </Tooltip>
              </h2>
              <Button url="/app/logs">View all logs</Button>
            </div>

            {analytics.recent.length ? (
              <table className="av-dash__logs-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Result</th>
                    <th>Status</th>
                    <th>Error</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recent.map((row) => {
                    const errorText = ERROR_TYPE_LABELS[row.errorType || ""] || row.errorType || "—";
                    const hasError = Boolean(row.errorType);
                    return (
                      <tr key={row.id}>
                        <td>
                          <Link className="av-dash__order-link" to="/app/logs">
                            {orderLabel(row)}
                          </Link>
                        </td>
                        <td>{formatLogWhen(row.createdAt)}</td>
                        <td>
                          <Badge tone={statusTone(row.result)}>{statusLabel(row.result)}</Badge>
                        </td>
                        <td>
                          <span className={hasError ? "av-dash__error-text" : undefined}>{errorText}</span>
                        </td>
                        <td>{actionLabel(row.actionTaken, row.result)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="av-dash__empty">No activity yet. Use Test Address to create the first result.</p>
            )}
          </div>

          {searchParams.get("saved") ? (
            <Banner tone="success" title="Settings saved">
              <p>AddressVerify updated the shop configuration used by checkout.</p>
            </Banner>
          ) : null}
        </BlockStack>
      </div>
    </AppPage>
  );
}
