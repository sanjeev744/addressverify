import type {
  MessageTranslation,
  OrderTagSetting,
  PoBoxRule,
  ShopSettings,
  ValidationMessage,
  ValidationRule,
} from "@prisma/client";
import prisma from "../db.server";
import { decryptSecret, encryptSecret } from "../lib/crypto.server";
import {
  DEFAULT_MESSAGES,
  DEFAULT_TAGS,
  HIDDEN_RULE_KEYS,
  MESSAGE_KEYS,
  RULE_CATALOG,
  RULE_KEYS,
  TAG_KEYS,
  normalizeAction,
  type RuleAction,
  type RuleKey,
} from "../lib/defaults";
import type { MerchantRule, PoBoxRuleInput, ProviderConfig, ValidationMessages } from "./validation/types";

export type ShopBundle = {
  settings: ShopSettings;
  rules: ValidationRule[];
  messages: ValidationMessage[];
  tags: OrderTagSetting[];
  poBoxRules: PoBoxRule[];
  translations: MessageTranslation[];
};

export async function ensureShopDefaults(shop: string): Promise<ShopBundle> {
  await prisma.shopSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });

  const existingRules = await prisma.validationRule.findMany({ where: { shop } });
  const existingKeys = new Set(existingRules.map((rule) => rule.ruleKey));
  const missingRules = RULE_KEYS.filter((key) => !existingKeys.has(key)).map((key) => ({
    shop,
    ruleKey: key,
    enabled: RULE_CATALOG[key].defaultEnabled,
    action: RULE_CATALOG[key].defaultAction,
  }));
  if (missingRules.length) {
    await prisma.validationRule.createMany({ data: missingRules });
  }
  await Promise.all(
    existingRules
      .filter((rule) => rule.action === "auto_correct")
      .map((rule) => prisma.validationRule.update({ where: { id: rule.id }, data: { action: "fix" } })),
  );

  // Rules removed from the merchant UI — keep rows but force them off.
  await Promise.all(
    existingRules
      .filter(
        (rule) =>
          (HIDDEN_RULE_KEYS as RuleKey[]).includes(rule.ruleKey as RuleKey) && rule.enabled,
      )
      .map((rule) =>
        prisma.validationRule.update({ where: { id: rule.id }, data: { enabled: false } }),
      ),
  );

  const existingMessages = await prisma.validationMessage.findMany({ where: { shop } });
  const existingMessageKeys = new Set(existingMessages.map((item) => item.messageKey));
  const missingMessages = MESSAGE_KEYS.filter((key) => !existingMessageKeys.has(key)).map((key) => ({
    shop,
    messageKey: key,
    title: DEFAULT_MESSAGES[key].title,
    body: DEFAULT_MESSAGES[key].body,
  }));
  if (missingMessages.length) {
    await prisma.validationMessage.createMany({ data: missingMessages });
  }

  const existingTags = await prisma.orderTagSetting.findMany({ where: { shop } });
  const existingTagKeys = new Set(existingTags.map((item) => item.tagKey));
  const missingTags = TAG_KEYS.filter((key) => !existingTagKeys.has(key)).map((key) => ({
    shop,
    tagKey: key,
    tag: DEFAULT_TAGS[key],
  }));
  if (missingTags.length) {
    await prisma.orderTagSetting.createMany({ data: missingTags });
  }

  return getShopBundle(shop);
}

export async function getShopBundle(shop: string): Promise<ShopBundle> {
  const [settings, rules, messages, tags, poBoxRules, translations] = await Promise.all([
    prisma.shopSettings.findUnique({ where: { shop } }),
    prisma.validationRule.findMany({ where: { shop } }),
    prisma.validationMessage.findMany({ where: { shop } }),
    prisma.orderTagSetting.findMany({ where: { shop } }),
    prisma.poBoxRule.findMany({ where: { shop } }),
    prisma.messageTranslation.findMany({ where: { shop } }),
  ]);
  if (!settings) {
    return ensureShopDefaults(shop);
  }
  return { settings, rules, messages, tags, poBoxRules, translations };
}

export function toMerchantRules(rules: ValidationRule[]): MerchantRule[] {
  return rules.map((rule) => ({
    ruleKey: rule.ruleKey as MerchantRule["ruleKey"],
    enabled: rule.enabled,
    action: normalizeAction(rule.action) as RuleAction,
  }));
}

export function toMessages(messages: ValidationMessage[]): ValidationMessages {
  return Object.fromEntries(messages.map((item) => [item.messageKey, { title: item.title, body: item.body }]));
}

export function toTranslations(rows: MessageTranslation[]) {
  const byLocale: Record<string, ValidationMessages> = {};
  for (const row of rows) {
    byLocale[row.locale] = byLocale[row.locale] || {};
    byLocale[row.locale][row.messageKey] = { title: row.title, body: row.body };
  }
  return byLocale;
}

export function toPoBoxRules(rows: PoBoxRule[]): PoBoxRuleInput[] {
  return rows.map((row) => ({
    name: row.name,
    action: normalizeAction(row.action),
    country: row.country,
    shippingMethod: row.shippingMethod,
    shippingZone: row.shippingZone,
    enabled: row.enabled,
  }));
}

export function toTagMap(rows: OrderTagSetting[]) {
  return Object.fromEntries(rows.map((row) => [row.tagKey, row.tag]));
}

export function toProviderConfig(settings: ShopSettings): ProviderConfig {
  return {
    type: settings.providerType,
    apiUrl: settings.providerApiUrl || "",
    apiKey: decryptSecret(settings.providerApiKey),
    timeoutMs: settings.providerTimeoutMs,
    fallbackType: settings.fallbackProviderType || "builtin",
    fallbackApiUrl: settings.fallbackProviderApiUrl || "",
    fallbackApiKey: decryptSecret(settings.fallbackProviderApiKey),
  };
}

export function publicSettings(settings: ShopSettings) {
  return {
    validationEnabled: settings.validationEnabled,
    failClosed: settings.failClosed,
    providerType: settings.providerType,
    providerApiUrl: settings.providerApiUrl || "",
    providerTimeoutMs: settings.providerTimeoutMs,
    fallbackProviderType: settings.fallbackProviderType,
    onboarded: settings.onboarded,
    onboardingStep: settings.onboardingStep,
    hasApiKey: Boolean(settings.providerApiKey),
    postCheckoutEnabled: settings.postCheckoutEnabled,
    postCheckoutMode: settings.postCheckoutMode,
    postCheckoutMinConfidence: settings.postCheckoutMinConfidence,
    holdInvalid: settings.holdInvalid,
    holdUnconfirmed: settings.holdUnconfirmed,
    holdPoBox: settings.holdPoBox,
    holdReview: settings.holdReview,
    klaviyoEnabled: settings.klaviyoEnabled,
    hasKlaviyoKey: Boolean(settings.klaviyoApiKey),
    planHandle: settings.planHandle,
    billingStatus: settings.billingStatus,
    monthlyValidations: settings.monthlyValidations,
    avgOrderValue: settings.avgOrderValue,
    avgReshipCost: settings.avgReshipCost,
    avgSupportCost: settings.avgSupportCost,
    estimatedCorrectionRate: settings.estimatedCorrectionRate,
  };
}

export function runtimeConfig(bundle: ShopBundle) {
  return {
    shop: bundle.settings.shop,
    appUrl: process.env.SHOPIFY_APP_URL || "",
    validationEnabled: bundle.settings.validationEnabled,
    postCheckoutEnabled: bundle.settings.postCheckoutEnabled,
    failClosed: bundle.settings.failClosed,
    rules: toMerchantRules(bundle.rules),
    messages: toMessages(bundle.messages),
    translations: toTranslations(bundle.translations),
    poBoxRules: toPoBoxRules(bundle.poBoxRules),
  };
}

export async function saveSettings(
  shop: string,
  input: Partial<{
    validationEnabled: boolean;
    failClosed: boolean;
    providerType: string;
    providerApiUrl: string;
    providerApiKey?: string;
    providerTimeoutMs: number;
    fallbackProviderType: string;
    onboarded: boolean;
    onboardingStep: number;
    postCheckoutEnabled: boolean;
    postCheckoutMode: string;
    postCheckoutMinConfidence: number;
    holdInvalid: boolean;
    holdUnconfirmed: boolean;
    holdPoBox: boolean;
    holdReview: boolean;
    klaviyoEnabled: boolean;
    klaviyoApiKey?: string;
    planHandle: string;
    billingStatus: string;
    avgOrderValue: number;
    avgReshipCost: number;
    avgSupportCost: number;
    estimatedCorrectionRate: number;
  }>,
) {
  const current = await prisma.shopSettings.findUnique({ where: { shop } });
  return prisma.shopSettings.update({
    where: { shop },
    data: {
      ...("validationEnabled" in input ? { validationEnabled: input.validationEnabled } : {}),
      ...("failClosed" in input ? { failClosed: input.failClosed } : {}),
      ...("providerType" in input ? { providerType: input.providerType } : {}),
      ...("providerApiUrl" in input ? { providerApiUrl: input.providerApiUrl } : {}),
      ...("providerTimeoutMs" in input ? { providerTimeoutMs: input.providerTimeoutMs } : {}),
      ...("fallbackProviderType" in input ? { fallbackProviderType: input.fallbackProviderType } : {}),
      ...("onboarded" in input ? { onboarded: input.onboarded } : {}),
      ...("onboardingStep" in input ? { onboardingStep: input.onboardingStep } : {}),
      ...("postCheckoutEnabled" in input ? { postCheckoutEnabled: input.postCheckoutEnabled } : {}),
      ...("postCheckoutMode" in input ? { postCheckoutMode: input.postCheckoutMode } : {}),
      ...("postCheckoutMinConfidence" in input ? { postCheckoutMinConfidence: input.postCheckoutMinConfidence } : {}),
      ...("holdInvalid" in input ? { holdInvalid: input.holdInvalid } : {}),
      ...("holdUnconfirmed" in input ? { holdUnconfirmed: input.holdUnconfirmed } : {}),
      ...("holdPoBox" in input ? { holdPoBox: input.holdPoBox } : {}),
      ...("holdReview" in input ? { holdReview: input.holdReview } : {}),
      ...("klaviyoEnabled" in input ? { klaviyoEnabled: input.klaviyoEnabled } : {}),
      ...("planHandle" in input ? { planHandle: input.planHandle } : {}),
      ...("billingStatus" in input ? { billingStatus: input.billingStatus } : {}),
      ...("avgOrderValue" in input ? { avgOrderValue: input.avgOrderValue } : {}),
      ...("avgReshipCost" in input ? { avgReshipCost: input.avgReshipCost } : {}),
      ...("avgSupportCost" in input ? { avgSupportCost: input.avgSupportCost } : {}),
      ...("estimatedCorrectionRate" in input ? { estimatedCorrectionRate: input.estimatedCorrectionRate } : {}),
      providerApiKey: input.providerApiKey
        ? encryptSecret(input.providerApiKey)
        : current?.providerApiKey,
      klaviyoApiKey: input.klaviyoApiKey ? encryptSecret(input.klaviyoApiKey) : current?.klaviyoApiKey,
    },
  });
}

export async function saveRules(shop: string, rules: Array<{ ruleKey: string; enabled: boolean; action: string }>) {
  await Promise.all(
    rules.map((rule) =>
      prisma.validationRule.upsert({
        where: { shop_ruleKey: { shop, ruleKey: rule.ruleKey } },
        update: { enabled: rule.enabled, action: normalizeAction(rule.action) },
        create: { shop, ruleKey: rule.ruleKey, enabled: rule.enabled, action: normalizeAction(rule.action) },
      }),
    ),
  );
}

export async function saveMessages(shop: string, messages: Array<{ messageKey: string; title: string; body: string }>) {
  await Promise.all(
    messages.map((item) =>
      prisma.validationMessage.upsert({
        where: { shop_messageKey: { shop, messageKey: item.messageKey } },
        update: { title: item.title, body: item.body },
        create: { shop, messageKey: item.messageKey, title: item.title, body: item.body },
      }),
    ),
  );
}

export async function saveTranslations(
  shop: string,
  rows: Array<{ messageKey: string; locale: string; title: string; body: string }>,
) {
  await Promise.all(
    rows.map((item) =>
      prisma.messageTranslation.upsert({
        where: { shop_messageKey_locale: { shop, messageKey: item.messageKey, locale: item.locale } },
        update: { title: item.title, body: item.body },
        create: { shop, ...item },
      }),
    ),
  );
}

export async function saveTags(shop: string, rows: Array<{ tagKey: string; tag: string }>) {
  await Promise.all(
    rows.map((item) =>
      prisma.orderTagSetting.upsert({
        where: { shop_tagKey: { shop, tagKey: item.tagKey } },
        update: { tag: item.tag.trim() || item.tagKey },
        create: { shop, tagKey: item.tagKey, tag: item.tag.trim() || item.tagKey },
      }),
    ),
  );
}

export async function savePoBoxRules(
  shop: string,
  rows: Array<{ id?: string; name: string; action: string; country: string; shippingMethod: string; shippingZone: string; enabled: boolean }>,
) {
  const keep = rows.map((row) => row.id).filter(Boolean) as string[];
  await prisma.poBoxRule.deleteMany({
    where: { shop, ...(keep.length ? { id: { notIn: keep } } : {}) },
  });
  await Promise.all(
    rows.map((row) =>
      row.id
        ? prisma.poBoxRule.updateMany({
            where: { id: row.id, shop },
            data: {
              name: row.name,
              action: normalizeAction(row.action),
              country: row.country.toUpperCase(),
              shippingMethod: row.shippingMethod,
              shippingZone: row.shippingZone,
              enabled: row.enabled,
            },
          })
        : prisma.poBoxRule.create({
            data: {
              shop,
              name: row.name,
              action: normalizeAction(row.action),
              country: row.country.toUpperCase(),
              shippingMethod: row.shippingMethod,
              shippingZone: row.shippingZone,
              enabled: row.enabled,
            },
          }),
    ),
  );
}

export async function incrementUsage(shop: string) {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  const now = new Date();
  const resetNeeded = !settings?.usageResetAt || settings.usageResetAt.getTime() + 30 * 24 * 60 * 60 * 1000 < now.getTime();
  return prisma.shopSettings.update({
    where: { shop },
    data: resetNeeded
      ? { monthlyValidations: 1, usageResetAt: now }
      : { monthlyValidations: { increment: 1 } },
  });
}

export async function deleteShopData(shop: string) {
  const { deleteBillingUsage } = await import("./billing.server");
  await deleteBillingUsage(shop);
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop } }),
    prisma.validationLog.deleteMany({ where: { shop } }),
    prisma.validationRule.deleteMany({ where: { shop } }),
    prisma.validationMessage.deleteMany({ where: { shop } }),
    prisma.messageTranslation.deleteMany({ where: { shop } }),
    prisma.orderTagSetting.deleteMany({ where: { shop } }),
    prisma.poBoxRule.deleteMany({ where: { shop } }),
    prisma.orderHold.deleteMany({ where: { shop } }),
    prisma.backgroundJob.deleteMany({ where: { shop } }),
    prisma.appEvent.deleteMany({ where: { shop } }),
    prisma.shopSettings.deleteMany({ where: { shop } }),
  ]);
}
