import { ERROR_TYPE_LABELS } from "./defaults";

type AnalyticsLike = {
  total: number;
  valid: number;
  invalid: number;
  corrected: number;
  blocked: number;
  autoFixed: number;
  manualFixed: number;
  held: number;
  successRate: number;
  errorRate: number;
  estimatedSavedShipments: number;
  estimatedSavedRevenue: number;
  roi: number;
  ordersCount?: number;
  commonErrors: Array<{ type: string; count: number; percent: number }>;
};

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function monthBounds(month: string) {
  // month = YYYY-MM
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return null;
  const start = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const end = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(year, mon - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  return { start, end, label, year, month: mon };
}

export function listRecentMonths(count = 12) {
  const now = new Date();
  const options: Array<{ label: string; value: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    options.push({ label, value });
  }
  return options;
}

export function buildMonthlyAnalyticsCsv(monthLabel: string, range: string, analytics: AnalyticsLike) {
  const lines: string[] = [];
  lines.push(`AddressVerify monthly report`);
  lines.push(`Period,${csvEscape(monthLabel)}`);
  lines.push(`Date range,${csvEscape(range)}`);
  lines.push("");
  lines.push("Metric,Value");
  lines.push(`Addresses checked,${analytics.total}`);
  lines.push(`Orders counted,${analytics.ordersCount ?? analytics.total}`);
  lines.push(`Valid addresses,${analytics.valid}`);
  lines.push(`Invalid addresses,${analytics.invalid}`);
  lines.push(`Addresses corrected,${analytics.corrected}`);
  lines.push(`Automatically fixed,${analytics.autoFixed}`);
  lines.push(`Manually corrected,${analytics.manualFixed}`);
  lines.push(`Blocked orders,${analytics.blocked}`);
  lines.push(`Orders on hold,${analytics.held}`);
  lines.push(`Validation success rate (%),${analytics.successRate}`);
  lines.push(`Address error rate (%),${analytics.errorRate}`);
  lines.push(`Estimated saved shipments,${analytics.estimatedSavedShipments}`);
  lines.push(`Estimated saved revenue,${analytics.estimatedSavedRevenue}`);
  lines.push(`ROI (x),${analytics.roi}`);
  lines.push("");
  lines.push("Error type,Count,Share (%)");
  if (analytics.commonErrors.length) {
    for (const item of analytics.commonErrors) {
      lines.push(
        [
          csvEscape(ERROR_TYPE_LABELS[item.type] || item.type),
          item.count,
          item.percent,
        ].join(","),
      );
    }
  } else {
    lines.push("No errors recorded,0,0");
  }
  return `${lines.join("\n")}\n`;
}
