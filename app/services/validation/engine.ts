import {
  DEFAULT_MESSAGES,
  DEFAULT_TRANSLATIONS,
  normalizeAction,
  normalizeLocale,
  type MessageKey,
} from "../../lib/defaults";
import { cacheKey, fingerprint, getCachedResult, setCachedResult } from "./cache";
import { runLocalRules, suggestedFromLocal } from "./local-rules";
import { createValidationProvider } from "./providers/factory";
import {
  addressesEqual,
  formatAddress,
  normalizeAddress,
  type AddressInput,
  type MerchantRule,
  type PoBoxRuleInput,
  type ProviderConfig,
  type ValidationContext,
  type ValidationMessages,
  type ValidationResult,
} from "./types";

export interface EngineOptions {
  shop?: string;
  rules: MerchantRule[];
  messages: ValidationMessages;
  translations?: Record<string, ValidationMessages>;
  provider: ProviderConfig;
  failClosed: boolean;
  validationEnabled: boolean;
  poBoxRules?: PoBoxRuleInput[];
  context?: ValidationContext;
}

export async function validateAddress(input: AddressInput, options: EngineOptions): Promise<ValidationResult> {
  const address = normalizeAddress(input);
  const locale = normalizeLocale(options.context?.locale);
  const messages = resolveMessages(options.messages, options.translations, locale);

  if (!options.validationEnabled) {
    return {
      valid: true,
      status: "valid",
      confidence: 1,
      errorTypes: [],
      issues: [],
      normalized: address,
      provider: options.provider.type,
      actionTaken: "allow",
    };
  }

  // Results depend on the merchant's configuration and the delivery context, not just the address.
  const key = options.shop
    ? cacheKey(
        options.shop,
        address,
        `${locale}:${fingerprint([
          options.rules,
          options.poBoxRules,
          options.messages,
          options.translations?.[locale],
          options.provider.type,
          options.provider.apiUrl,
          options.provider.fallbackType,
          options.failClosed,
          options.context?.shippingMethod,
          options.context?.shippingZone,
        ])}`,
      )
    : "";
  if (key) {
    const cached = getCachedResult(key);
    if (cached) return cached;
  }

  const localIssues = runLocalRules(address, options.rules, options.poBoxRules, options.context).filter(
    (issue) => issue.action !== "allow",
  );
  const providerResult = await verifyWithFailover(address, options.provider);

  if (providerResult.unavailable) {
    if (options.failClosed) {
      return finish(
        {
          valid: false,
          status: "unavailable",
          confidence: 0,
          errorTypes: ["service_unavailable"],
          issues: [{ type: "service_unavailable", action: "block", messageKey: "service_unavailable" }],
          provider: options.provider.type,
          actionTaken: "block",
        },
        messages,
        key,
      );
    }
    const blockingLocal = localIssues.filter((issue) => issue.action === "block");
    if (blockingLocal.length > 0) {
      return finish(fromIssues(address, localIssues, options.provider.type, 0.4), messages, key);
    }
    return finish(
      {
        valid: true,
        status: "unavailable",
        confidence: 0,
        errorTypes: ["service_unavailable"],
        issues: [{ type: "service_unavailable", action: "warn", messageKey: "service_unavailable" }],
        normalized: address,
        provider: options.provider.type,
        actionTaken: "unavailable",
      },
      messages,
      key,
    );
  }

  const issues = [...localIssues];
  if (!providerResult.valid && options.rules.find((rule) => rule.ruleKey === "detect_invalid")?.enabled) {
    const invalidRule = options.rules.find((rule) => rule.ruleKey === "detect_invalid");
    if (invalidRule && normalizeAction(invalidRule.action) !== "allow" && !issues.some((issue) => issue.type === "address_unverified")) {
      issues.push({
        type: "address_unverified",
        action: normalizeAction(invalidRule.action),
        messageKey: "address_unverified",
      });
    }
  }

  const suggested = ("suggested" in providerResult && providerResult.suggested) || suggestedFromLocal(address, issues);
  const normalized = ("normalized" in providerResult && providerResult.normalized) || suggested;
  const hasSuggestion = Boolean(suggested && !addressesEqual(suggested, address));
  if (hasSuggestion && !issues.some((issue) => issue.type === "street_typo" || issue.type === "address_unverified")) {
    // Only rewrite addresses automatically when the merchant enabled auto-correction.
    const autoCorrect = options.rules.find((rule) => rule.ruleKey === "auto_correct_typos");
    issues.push({
      type: "address_unverified",
      action: autoCorrect?.enabled ? normalizeAction(autoCorrect.action) : "warn",
      messageKey: "address_unverified",
    });
  }

  return finish(
    fromIssues(address, issues, providerResult.provider || options.provider.type, providerResult.confidence || 0.7, suggested, normalized),
    messages,
    key,
  );
}

async function verifyWithFailover(address: AddressInput, provider: ProviderConfig) {
  const chain = [
    { type: provider.type, apiUrl: provider.apiUrl, apiKey: provider.apiKey, timeoutMs: provider.timeoutMs },
    {
      type: provider.fallbackType || "builtin",
      apiUrl: provider.fallbackApiUrl,
      apiKey: provider.fallbackApiKey,
      timeoutMs: provider.timeoutMs,
    },
    { type: "builtin", timeoutMs: provider.timeoutMs },
  ].filter((item, index, list) => list.findIndex((other) => other.type === item.type && other.apiUrl === item.apiUrl) === index);

  let last = {
    valid: false,
    status: "unavailable" as const,
    confidence: 0,
    errorTypes: ["service_unavailable"],
    unavailable: true,
    provider: provider.type,
  };

  for (const item of chain) {
    try {
      const result = await createValidationProvider(item).verify(address);
      if (!result.unavailable) {
        return { ...result, provider: item.type };
      }
      last = { ...last, provider: item.type };
    } catch {
      last = { ...last, provider: item.type };
    }
  }
  return last;
}

function fromIssues(
  address: AddressInput,
  issues: ValidationResult["issues"],
  provider: string,
  confidence: number,
  suggested?: AddressInput,
  normalized?: AddressInput,
): ValidationResult {
  const blocking = issues.filter((issue) => issue.action === "block");
  const review = issues.filter((issue) => issue.action === "review");
  const auto = issues.filter((issue) => issue.action === "fix");
  const warnings = issues.filter((issue) => issue.action === "warn");
  const errorTypes = [...new Set(issues.map((issue) => issue.type))];
  const suggestion = suggested || normalized;

  if (blocking.length > 0) {
    return {
      valid: false,
      status: "invalid",
      confidence,
      errorTypes,
      issues,
      suggested: suggestion,
      normalized: suggestion || address,
      provider,
      actionTaken: "block",
    };
  }

  if (auto.length > 0 && suggestion && !addressesEqual(suggestion, address)) {
    return {
      valid: true,
      status: "corrected",
      confidence,
      errorTypes,
      issues,
      suggested: suggestion,
      normalized: suggestion,
      provider,
      actionTaken: "fix",
    };
  }

  if (review.length > 0) {
    return {
      valid: true,
      status: "warning",
      confidence,
      errorTypes,
      issues,
      suggested: suggestion,
      normalized: suggestion || address,
      provider,
      actionTaken: "review",
    };
  }

  if (warnings.length > 0 || (suggestion && !addressesEqual(suggestion, address))) {
    return {
      valid: true,
      status: "warning",
      confidence,
      errorTypes,
      issues,
      suggested: suggestion,
      normalized: suggestion || address,
      provider,
      actionTaken: "warn",
    };
  }

  return {
    valid: true,
    status: "valid",
    confidence,
    errorTypes: [],
    issues: [],
    normalized: normalized || address,
    provider,
    actionTaken: "allow",
  };
}

function resolveMessages(
  messages: ValidationMessages,
  translations: Record<string, ValidationMessages> | undefined,
  locale: string,
): ValidationMessages {
  const pack =
    locale === "en"
      ? DEFAULT_MESSAGES
      : DEFAULT_TRANSLATIONS[locale as keyof typeof DEFAULT_TRANSLATIONS] || DEFAULT_MESSAGES;
  return { ...pack, ...messages, ...(translations?.[locale] || {}) };
}

function finish(result: ValidationResult, messages: ValidationMessages, key: string) {
  const decorated = withMessage(result, messages);
  if (key) setCachedResult(key, decorated);
  return decorated;
}

function withMessage(result: ValidationResult, messages: Record<string, { title: string; body: string }>) {
  const key = (result.issues[0]?.messageKey ||
    (result.status === "unavailable" ? "service_unavailable" : "address_unverified")) as MessageKey;
  const copy = messages[key] || DEFAULT_MESSAGES[key] || DEFAULT_MESSAGES.address_unverified;
  return {
    ...result,
    messageKey: key,
    messageTitle: copy.title,
    messageBody: copy.body,
  };
}

export function checkoutPayload(result: ValidationResult, original: AddressInput) {
  return {
    valid: result.valid,
    status: result.status,
    confidence: result.confidence,
    errorTypes: result.errorTypes,
    actionTaken: result.actionTaken,
    messageTitle: result.messageTitle,
    messageBody: result.messageBody,
    original: formatAddress(original),
    suggested: result.suggested,
    suggestedFormatted: result.suggested ? formatAddress(result.suggested) : null,
    normalized: result.normalized,
  };
}
