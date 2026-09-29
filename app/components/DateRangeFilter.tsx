import { Button, InlineStack, Select, TextField } from "@shopify/polaris";
import type { DatePreset } from "../lib/defaults";

const OPTIONS = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Custom range", value: "custom" },
];

export function DateRangeFilter({
  preset,
  start,
  end,
  onPreset,
  onStart,
  onEnd,
  onApply,
}: {
  preset: DatePreset;
  start: string;
  end: string;
  onPreset: (value: DatePreset) => void;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <InlineStack gap="300" blockAlign="end" wrap>
      <div style={{ minWidth: 180 }}>
        <Select label="Date range" options={OPTIONS} value={preset} onChange={(value) => onPreset(value as DatePreset)} />
      </div>
      {preset === "custom" ? (
        <>
          <TextField label="From" type="date" value={start} onChange={onStart} autoComplete="off" />
          <TextField label="To" type="date" value={end} onChange={onEnd} autoComplete="off" />
        </>
      ) : null}
      <Button onClick={onApply}>Apply</Button>
    </InlineStack>
  );
}
