import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Button,
  ProgressBar,
  Select,
  Text,
} from "@shopify/polaris";
import {
  ChartVerticalIcon,
  CheckCircleIcon,
  CashDollarIcon,
  EditIcon,
  XCircleIcon,
} from "@shopify/polaris-icons";
import { useMemo, useState } from "react";
import { AppPage } from "../components/AppPage";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { SavingsCalculator } from "../components/SavingsCalculator";
import { StatCard } from "../components/StatCard";
import { listRecentMonths } from "../lib/analytics-report";
import { dateQuery, parseDateQuery } from "../lib/date-query";
import { ERROR_TYPE_LABELS, type DatePreset } from "../lib/defaults";
import { getAnalytics } from "../services/logs.server";
import { authenticate } from "../shopify.server";
import analyticsStyles from "../styles/analytics.css?url";
import calculatorStyles from "../styles/calculator.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: analyticsStyles },
  { rel: "stylesheet", href: calculatorStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const query = parseDateQuery(new URL(request.url));
  try {
    const { syncOrdersIntoAnalytics } = await import("../services/analytics-sync.server");
    await syncOrdersIntoAnalytics(session.shop, admin, query.preset, query.start, query.end);
  } catch (error) {
    console.warn("AddressVerify analytics sync skipped", error);
  }
  const analytics = await getAnalytics(session.shop, query.preset, query.start, query.end, admin);
  return { query, analytics };
};

export default function AnalyticsPage() {
  const { query, analytics } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const monthOptions = useMemo(() => listRecentMonths(12), []);
  const [preset, setPreset] = useState<DatePreset>(query.preset);
  const [start, setStart] = useState(query.start);
  const [end, setEnd] = useState(query.end);
  const [reportMonth, setReportMonth] = useState(monthOptions[0]?.value || "");

  const correctionRate = analytics.total ? Math.round((analytics.corrected / analytics.total) * 100) : 0;
  const blockRate = analytics.total ? Math.round((analytics.blocked / analytics.total) * 100) : 0;

  const downloadReport = () => {
    if (!reportMonth) return;
    window.location.href = `/app/analytics/report?month=${encodeURIComponent(reportMonth)}`;
  };

  const metrics = [
    {
      label: "Addresses checked",
      value: analytics.total,
      icon: ChartVerticalIcon,
      iconTone: "info" as const,
    },
    {
      label: "Success rate",
      value: `${analytics.successRate}%`,
      tone: "success" as const,
      icon: CheckCircleIcon,
      iconTone: "success" as const,
    },
    {
      label: "Error rate",
      value: `${analytics.errorRate}%`,
      tone: "critical" as const,
      icon: XCircleIcon,
      iconTone: "critical" as const,
    },
    {
      label: "Automatically fixed",
      value: analytics.autoFixed,
      tone: "info" as const,
      icon: EditIcon,
      iconTone: "info" as const,
    },
    {
      label: "Estimated saved revenue",
      value: `$${analytics.estimatedSavedRevenue.toLocaleString()}`,
      tone: "success" as const,
      icon: CashDollarIcon,
      iconTone: "success" as const,
    },
  ];

  const secondary = [
    { label: "Manually corrected", value: analytics.manualFixed },
    { label: "Blocked orders", value: analytics.blocked, tone: "caution" as const },
    { label: "Orders on hold", value: analytics.held, tone: "caution" as const },
    { label: "Saved shipments", value: analytics.estimatedSavedShipments },
    { label: "ROI", value: `${analytics.roi}x`, tone: "success" as const },
  ];

  return (
    <AppPage
      title="Analytics"
      subtitle="Business impact of checkout and post-checkout validation."
    >
      <div className="av-analytics">
        <BlockStack gap="400">
          <div className="av-analytics__toolbar">
            <div className="av-analytics__card">
              <h2 className="av-analytics__card-title">Date range</h2>
              <DateRangeFilter
                preset={preset}
                start={start}
                end={end}
                onPreset={setPreset}
                onStart={setStart}
                onEnd={setEnd}
                onApply={() => navigate(`/app/analytics${dateQuery(preset, start, end)}`)}
              />
            </div>

            <div className="av-analytics__card">
              <h2 className="av-analytics__card-title">Download monthly report</h2>
              <p className="av-analytics__card-desc">
                Export a CSV summary for any month — metrics, savings, and error mix.
              </p>
              <div className="av-analytics__download-row">
                <Select
                  label="Month"
                  labelHidden
                  options={monthOptions}
                  value={reportMonth}
                  onChange={setReportMonth}
                />
                <Button variant="primary" onClick={downloadReport}>
                  Download report
                </Button>
              </div>
            </div>
          </div>

          {analytics.estimatesAreProjected && analytics.total > 0 ? (
            <Banner tone="info" title="Estimated savings use your ROI assumptions">
              <Text as="p">
                Saved shipments and revenue are projected from {analytics.ordersCount || analytics.total} orders
                in this range using your average reship cost and correction rate until checkout logging captures
                more corrections.
              </Text>
            </Banner>
          ) : null}

          <div className="av-analytics__metrics">
            {metrics.map((stat) => (
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

          <div className="av-analytics__metrics">
            {secondary.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
            ))}
          </div>

          <div className="av-analytics__rates">
            <div className="av-analytics__card">
              <h2 className="av-analytics__card-title">Correction rate</h2>
              <p className="av-analytics__rate-value av-analytics__rate-value--green">{correctionRate}%</p>
              <ProgressBar progress={correctionRate} tone="primary" size="small" />
              <p className="av-analytics__rate-meta">
                {analytics.corrected} of {analytics.total} addresses received a suggested correction.
              </p>
            </div>
            <div className="av-analytics__card">
              <h2 className="av-analytics__card-title">Block rate</h2>
              <p className="av-analytics__rate-value av-analytics__rate-value--red">{blockRate}%</p>
              <ProgressBar progress={blockRate} tone="critical" size="small" />
              <p className="av-analytics__rate-meta">
                {analytics.blocked} checkouts were blocked until the address was fixed.
              </p>
            </div>
          </div>

          <div className="av-analytics__card">
            <h2 className="av-analytics__card-title">Error mix</h2>
            {analytics.commonErrors.length ? (
              <table className="av-analytics__table">
                <thead>
                  <tr>
                    <th>Error</th>
                    <th>Count</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.commonErrors.map((item) => (
                    <tr key={item.type}>
                      <td>
                        <Button
                          variant="plain"
                          url={`/app/logs${dateQuery(preset, start, end, { error: item.type })}`}
                        >
                          {ERROR_TYPE_LABELS[item.type] || item.type}
                        </Button>
                      </td>
                      <td>{item.count}</td>
                      <td>
                        <span className="av-analytics__share">
                          {item.percent}%
                          <span className="av-analytics__bar" aria-hidden>
                            <span style={{ width: `${Math.min(100, item.percent)}%` }} />
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="av-analytics__empty">No errors recorded in this range.</p>
            )}
          </div>

          <SavingsCalculator />
        </BlockStack>
      </div>
    </AppPage>
  );
}
