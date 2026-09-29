import { applyLocalCorrections } from "../local-rules";
import type { AddressInput, AddressValidationProvider, ProviderResponse } from "../types";

/** Heuristic for addresses the built-in engine cannot treat as deliverable. */
function looksUnverifiable(address: AddressInput) {
  const blob = `${address.address1} ${address.address2 || ""} ${address.city} ${address.province || ""}`;
  if (/nonexistent|notareal|fakeville|zzzz|xxxyyy/i.test(blob)) return true;
  if ((address.province || "").toUpperCase() === "ZZ") return true;
  return false;
}

export class BuiltinProvider implements AddressValidationProvider {
  readonly name = "builtin";

  async verify(address: AddressInput): Promise<ProviderResponse> {
    // Unverifiable addresses must stay invalid so "Detect invalid → Review" can run.
    if (looksUnverifiable(address)) {
      return {
        valid: false,
        status: "invalid",
        confidence: 0.25,
        errorTypes: ["address_unverified"],
      };
    }

    const corrected = applyLocalCorrections(address);
    return {
      valid: true,
      status: corrected.changed ? "corrected" : "valid",
      confidence: corrected.changed ? 0.82 : 0.9,
      errorTypes: corrected.changed ? ["street_typo"] : [],
      suggested: corrected.changed ? corrected.address : undefined,
      normalized: corrected.address,
    };
  }
}
