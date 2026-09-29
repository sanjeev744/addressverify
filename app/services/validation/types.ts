import type { MessageKey, RuleAction, RuleKey } from "../../lib/defaults";

export interface AddressInput {
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  country: string;
}

export type ValidationStatus =
  | "valid"
  | "invalid"
  | "corrected"
  | "warning"
  | "unavailable";

export interface ValidationIssue {
  type: MessageKey | "street_typo";
  action: RuleAction;
  messageKey: MessageKey;
}

export interface ValidationResult {
  valid: boolean;
  status: ValidationStatus;
  confidence: number;
  errorTypes: string[];
  issues: ValidationIssue[];
  suggested?: AddressInput;
  normalized?: AddressInput;
  messageKey?: MessageKey;
  messageTitle?: string;
  messageBody?: string;
  provider: string;
  actionTaken: "allow" | "warn" | "fix" | "auto_correct" | "block" | "review" | "unavailable";
}

export interface ValidationContext {
  locale?: string;
  shippingMethod?: string;
  shippingZone?: string;
}

export interface PoBoxRuleInput {
  name: string;
  action: RuleAction;
  country: string;
  shippingMethod: string;
  shippingZone: string;
  enabled: boolean;
}

export interface MerchantRule {
  ruleKey: RuleKey;
  enabled: boolean;
  action: RuleAction;
}

export interface ValidationMessages {
  [key: string]: { title: string; body: string };
}

export interface ProviderConfig {
  type: string;
  apiUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  fallbackType?: string;
  fallbackApiUrl?: string;
  fallbackApiKey?: string;
}

export interface AddressValidationProvider {
  readonly name: string;
  verify(address: AddressInput): Promise<ProviderResponse>;
}

export interface ProviderResponse {
  valid: boolean;
  status: ValidationStatus;
  confidence: number;
  errorTypes: string[];
  suggested?: AddressInput;
  normalized?: AddressInput;
  unavailable?: boolean;
}

export function emptyAddress(): AddressInput {
  return {
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "",
  };
}

export function normalizeAddress(input: Partial<AddressInput> | null | undefined): AddressInput {
  return {
    address1: (input?.address1 || "").trim(),
    address2: (input?.address2 || "").trim(),
    city: (input?.city || "").trim(),
    province: (input?.province || "").trim(),
    zip: (input?.zip || "").trim(),
    country: (input?.country || "").trim().toUpperCase(),
  };
}

export function formatAddress(address: AddressInput) {
  return [address.address1, address.address2, address.city, address.province, address.zip, address.country]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(", ");
}

export function addressesEqual(a?: AddressInput, b?: AddressInput) {
  if (!a || !b) return false;
  return formatAddress(a).toLowerCase() === formatAddress(b).toLowerCase();
}
