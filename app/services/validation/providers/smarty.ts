import { normalizeAddress } from "../types";
import type { AddressInput, AddressValidationProvider, ProviderResponse } from "../types";

export class SmartyProvider implements AddressValidationProvider {
  readonly name = "smarty";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async verify(address: AddressInput): Promise<ProviderResponse> {
    if (!this.apiKey) return unavailable();
    // Smarty's US Street API only knows US addresses; let the fallback provider handle the rest.
    if (address.country && address.country !== "US") return unavailable();
    const [authId, authToken] = this.apiKey.split(":");
    const params = new URLSearchParams({
      street: address.address1,
      street2: address.address2 || "",
      city: address.city,
      state: address.province || "",
      zipcode: address.zip,
      candidates: "1",
    });
    if (authToken) {
      params.set("auth-id", authId);
      params.set("auth-token", authToken);
    } else {
      params.set("key", this.apiKey);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://us-street.api.smarty.com/street-address?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) return unavailable();
      const payload = (await response.json()) as Array<{
        delivery_line_1?: string;
        delivery_line_2?: string;
        components?: {
          city_name?: string;
          state_abbreviation?: string;
          zipcode?: string;
          plus4_code?: string;
        };
        analysis?: { dpv_match_code?: string };
      }>;
      const match = payload?.[0];
      if (!match) {
        return {
          valid: false,
          status: "invalid",
          confidence: 0.2,
          errorTypes: ["address_unverified"],
        };
      }
      const zip = match.components?.plus4_code
        ? `${match.components.zipcode}-${match.components.plus4_code}`
        : match.components?.zipcode || address.zip;
      const suggested = normalizeAddress({
        address1: match.delivery_line_1 || address.address1,
        address2: match.delivery_line_2 || address.address2,
        city: match.components?.city_name || address.city,
        province: match.components?.state_abbreviation || address.province,
        zip,
        country: "US",
      });
      const valid = ["Y", "S", "D"].includes(match.analysis?.dpv_match_code || "");
      return {
        valid,
        status: valid ? "valid" : "corrected",
        confidence: valid ? 0.96 : 0.5,
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
