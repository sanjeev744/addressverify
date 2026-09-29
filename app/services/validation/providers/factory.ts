import type { AddressValidationProvider, ProviderConfig } from "../types";
import { BuiltinProvider } from "./builtin";
import { GoogleProvider } from "./google";
import { HttpProvider } from "./http";
import { LoqateProvider } from "./loqate";
import { SmartyProvider } from "./smarty";

export function createValidationProvider(config: ProviderConfig): AddressValidationProvider {
  const timeoutMs = config.timeoutMs || 2500;
  switch (config.type) {
    case "http":
      return new HttpProvider(config.apiUrl || "", config.apiKey || "", timeoutMs);
    case "google":
      return new GoogleProvider(config.apiKey || "", timeoutMs);
    case "loqate":
      return new LoqateProvider(config.apiKey || "", timeoutMs);
    case "smarty":
      return new SmartyProvider(config.apiKey || "", timeoutMs);
    default:
      return new BuiltinProvider();
  }
}
