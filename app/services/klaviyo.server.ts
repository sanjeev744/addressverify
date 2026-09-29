import { decryptSecret } from "../lib/crypto.server";
import { logEvent } from "./monitor.server";

export type KlaviyoEventName =
  | "Address Validated"
  | "Address Error Detected"
  | "Address Automatically Fixed"
  | "Address Requires Review"
  | "PO Box Detected"
  | "Address Correction Required";

export async function sendKlaviyoEvent(
  shop: string,
  apiKeyEncrypted: string | null | undefined,
  enabled: boolean,
  event: KlaviyoEventName,
  properties: Record<string, unknown>,
) {
  if (!enabled || !apiKeyEncrypted) return;
  const apiKey = decryptSecret(apiKeyEncrypted);
  if (!apiKey) return;
  try {
    const response = await fetch("https://a.klaviyo.com/api/events/", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: "2024-10-15",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            metric: { data: { type: "metric", attributes: { name: event } } },
            properties: {
              shop,
              timestamp: new Date().toISOString(),
              ...properties,
            },
            unique_id: `${shop}:${properties.orderId || ""}:${event}:${Date.now()}`,
          },
        },
      }),
    });
    if (!response.ok) {
      await logEvent(shop, "warn", "Klaviyo event failed", { event, status: response.status });
    }
  } catch (error) {
    await logEvent(shop, "warn", "Klaviyo request error", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function eventsFromResult(result: {
  actionTaken: string;
  errorTypes: string[];
  status: string;
}): KlaviyoEventName[] {
  const events: KlaviyoEventName[] = [];
  if (result.status === "valid" && result.actionTaken === "allow") events.push("Address Validated");
  if (result.errorTypes.length) events.push("Address Error Detected");
  if (result.actionTaken === "fix" || result.status === "corrected") events.push("Address Automatically Fixed");
  if (result.actionTaken === "review") events.push("Address Requires Review");
  if (result.errorTypes.includes("po_box_not_allowed")) events.push("PO Box Detected");
  if (result.actionTaken === "block" || result.status === "invalid") events.push("Address Correction Required");
  return [...new Set(events)];
}
