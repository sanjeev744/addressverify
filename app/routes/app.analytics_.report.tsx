import type { LoaderFunctionArgs } from "@remix-run/node";
import { buildMonthlyAnalyticsCsv, monthBounds } from "../lib/analytics-report";
import { getAnalytics } from "../services/logs.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";
  const bounds = monthBounds(month);
  if (!bounds) {
    return new Response("Invalid month. Use YYYY-MM.", { status: 400 });
  }

  try {
    const { syncOrdersIntoAnalytics } = await import("../services/analytics-sync.server");
    await syncOrdersIntoAnalytics(session.shop, admin, "custom", bounds.start, bounds.end);
  } catch (error) {
    console.warn("AddressVerify monthly report sync skipped", error);
  }

  const analytics = await getAnalytics(session.shop, "custom", bounds.start, bounds.end, admin);
  const csv = buildMonthlyAnalyticsCsv(
    bounds.label,
    `${bounds.start} to ${bounds.end}`,
    analytics,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="addressverify-${month}-report.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
