import { normalizeAddress } from "../types";
import type { AddressInput, AddressValidationProvider, ProviderResponse } from "../types";

export class LoqateProvider implements AddressValidationProvider {
  readonly name = "loqate";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async verify(address: AddressInput): Promise<ProviderResponse> {
    if (!this.apiKey) return unavailable();
    const params = new URLSearchParams({
      Key: this.apiKey,
      Address1: address.address1,
      Address2: address.address2 || "",
      City: address.city,
      Province: address.province || "",
      PostalCode: address.zip,
      Country: address.country,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(
        `https://api.addressy.com/Cleansing/International/Batch/v1.00/json4.ws?${params.toString()}`,
        { signal: controller.signal },
      );
      if (!response.ok) return unavailable();
      const payload = (await response.json()) as Array<{
        Matches?: Array<{
          Address1?: string;
          Address2?: string;
          Locality?: string;
          AdministrativeArea?: string;
          PostalCode?: string;
          Country?: string;
          AQI?: string;
        }>;
      }>;
      const match = payload?.[0]?.Matches?.[0];
      if (!match) {
        return {
          valid: false,
          status: "invalid",
          confidence: 0.2,
          errorTypes: ["address_unverified"],
        };
      }
      const suggested = normalizeAddress({
        address1: match.Address1 || address.address1,
        address2: match.Address2 || address.address2,
        city: match.Locality || address.city,
        province: match.AdministrativeArea || address.province,
        zip: match.PostalCode || address.zip,
        country: match.Country || address.country,
      });
      const quality = (match.AQI || "").toUpperCase();
      const valid = ["A", "B"].includes(quality);
      return {
        valid,
        status: valid ? "valid" : "corrected",
        confidence: valid ? 0.93 : 0.6,
        errorTypes: valid ? [] : ["address_unverified"],
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
