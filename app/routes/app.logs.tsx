import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Badge, Banner, BlockStack, Button, ButtonGroup, Card, DataTable, Text } from "@shopify/polaris";
import { AppPage } from "../components/AppPage";
import { useState } from "react";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { dateQuery, parseDateQuery } from "../lib/date-query";
import { ERROR_TYPE_LABELS, type DatePreset } from "../lib/defaults";
import { listLogs } from "../services/logs.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const query = parseDateQuery(new URL(request.url));
  const logs = await listLogs(session.shop, query.preset, query.start, query.end, query.page, 20, query.errorType);
  return { query, logs };
};

export default function LogsPage() {
  const { query, logs } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<DatePreset>(query.preset);
  const [start, setStart] = useState(query.start);
  const [end, setEnd] = useState(query.end);
  const pages = Math.max(1, Math.ceil(logs.total / logs.pageSize));

  return (
    <AppPage title="Validation logs" subtitle="Checkout and test activity without customer names, emails, or phone numbers.">
      <BlockStack gap="400">
        {logs.errorType ? (
          <Banner title={`Filtered by ${ERROR_TYPE_LABELS[logs.errorType] || logs.errorType}`} action={{ content: "Clear filter", url: `/app/logs${dateQuery(preset, start, end)}` }} />
        ) : null}
        <Card>
          <DateRangeFilter
            preset={preset}
            start={start}
            end={end}
            onPreset={setPreset}
            onStart={setStart}
            onEnd={setEnd}
            onApply={() => navigate(`/app/logs${dateQuery(preset, start, end)}`)}
          />
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="p" tone="subdued">
              {logs.total} records
            </Text>
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text", "text", "text"]}
              headings={[
                "Date / time",
                "Reference",
                "Country",
                "Original address",
                "Corrected address",
                "Result",
                "Error type",
                "Action",
              ]}
              rows={logs.rows.map((row) => [
                new Date(row.createdAt).toLocaleString(),
                row.orderRef || (row.checkoutRef ? row.checkoutRef.slice(0, 10) : "—"),
                row.country || "—",
                row.originalAddress,
                row.correctedAddress || "—",
                <Badge
                  key={`${row.id}-result`}
                  tone={row.result === "invalid" ? "critical" : row.result === "valid" || row.result === "corrected" ? "success" : "warning"}
                >
                  {row.result}
                </Badge>,
                ERROR_TYPE_LABELS[row.errorType || ""] || row.errorType || "—",
                row.actionTaken,
              ])}
            />
            <ButtonGroup>
              <Button
                disabled={logs.page <= 1}
                onClick={() => navigate(`/app/logs${dateQuery(preset, start, end, { page: logs.page - 1, ...(logs.errorType ? { error: logs.errorType } : {}) })}`)}
              >
                Previous
              </Button>
              <Button
                disabled={logs.page >= pages}
                onClick={() => navigate(`/app/logs${dateQuery(preset, start, end, { page: logs.page + 1, ...(logs.errorType ? { error: logs.errorType } : {}) })}`)}
              >
                Next
              </Button>
            </ButtonGroup>
          </BlockStack>
        </Card>
      </BlockStack>
    </AppPage>
  );
}
