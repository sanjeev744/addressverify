import { normalizeAddress } from "../types";
import type { AddressInput, AddressValidationProvider, ProviderResponse } from "../types";

export class HttpProvider implements AddressValidationProvider {
  readonly name = "http";

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async verify(address: AddressInput): Promise<ProviderResponse> {
    if (!this.apiUrl) {
      return {
        valid: false,
        status: "unavailable",
        confidence: 0,
        errorTypes: ["service_unavailable"],
        unavailable: true,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ address }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return unavailable();
      }
      const payload = (await response.json()) as Record<string, unknown>;
      return {
        valid: Boolean(payload.valid),
        status: (payload.status as ProviderResponse["status"]) || (payload.valid ? "valid" : "invalid"),
        confidence: Number(payload.confidence ?? 0.7),
        errorTypes: Array.isArray(payload.errorTypes) ? (payload.errorTypes as string[]) : [],
        suggested: payload.suggested ? normalizeAddress(payload.suggested as AddressInput) : undefined,
        normalized: payload.normalized ? normalizeAddress(payload.normalized as AddressInput) : undefined,
      };
    } catch {
      return unavailable();
    } finally {
      clearTimeout(timer);
    }
  }
}

function unavailable(): ProviderResponse {
  return {
    valid: false,
    status: "unavailable",
    confidence: 0,
    errorTypes: ["service_unavailable"],
    unavailable: true,
  };
}
