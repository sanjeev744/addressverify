import { normalizeAddress } from "../types";
import type { AddressInput, AddressValidationProvider, ProviderResponse } from "../types";

export class GoogleProvider implements AddressValidationProvider {
  readonly name = "google";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async verify(address: AddressInput): Promise<ProviderResponse> {
    if (!this.apiKey) return unavailable();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            address: {
              regionCode: address.country || "US",
              addressLines: [address.address1, address.address2].filter(Boolean),
              locality: address.city,
              administrativeArea: address.province,
              postalCode: address.zip,
            },
          }),
        },
      );
      if (!response.ok) return unavailable();
      const data = (await response.json()) as {
        result?: {
          verdict?: { addressComplete?: boolean; hasUnconfirmedComponents?: boolean; validationGranularity?: string };
          address?: {
            formattedAddress?: string;
            postalAddress?: {
              addressLines?: string[];
              locality?: string;
              administrativeArea?: string;
              postalCode?: string;
              regionCode?: string;
            };
          };
        };
      };
      const verdict = data.result?.verdict;
      const postal = data.result?.address?.postalAddress;
      const suggested = postal
        ? normalizeAddress({
            address1: postal.addressLines?.[0] || address.address1,
            address2: postal.addressLines?.[1] || address.address2,
            city: postal.locality || address.city,
            province: postal.administrativeArea || address.province,
            zip: postal.postalCode || address.zip,
            country: postal.regionCode || address.country,
          })
        : undefined;
      const complete = Boolean(verdict?.addressComplete) && !verdict?.hasUnconfirmedComponents;
      return {
        valid: complete,
        status: complete ? "valid" : suggested ? "corrected" : "invalid",
        confidence: complete ? 0.95 : 0.55,
        errorTypes: complete ? [] : ["address_unverified"],
        suggested,
        normalized: suggested,
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
