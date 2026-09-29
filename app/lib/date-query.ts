import type { DatePreset } from "./defaults";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(value: string | null) {
  return value && ISO_DAY.test(value) && !Number.isNaN(Date.parse(value)) ? value : "";
}

export function parseDateQuery(url: URL) {
  const preset = (url.searchParams.get("range") || "7d") as DatePreset;
  const page = Math.floor(Number(url.searchParams.get("page") || "1"));
  return {
    preset: ["today", "7d", "30d", "90d", "custom"].includes(preset) ? preset : "7d",
    start: isoDay(url.searchParams.get("start")),
    end: isoDay(url.searchParams.get("end")),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
    errorType: url.searchParams.get("error") || "",
  };
}

export function dateQuery(preset: DatePreset, start: string, end: string, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({ range: preset, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) });
  if (preset === "custom") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  }
  return `?${params.toString()}`;
}
