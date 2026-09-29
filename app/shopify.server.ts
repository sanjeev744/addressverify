import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { BILLING_CONFIG, BILLING_TIERS, USAGE_PLAN_HANDLE } from "./lib/plans";
import { ensureShopDefaults } from "./services/shop.server";
import { ensureValidationFunction, syncShopConfig } from "./services/shopify-sync.server";

const usageBillingPlans = Object.fromEntries(
  BILLING_TIERS.map((tier) => [
    tier.handle,
    {
      lineItems: [
        {
          amount: BILLING_CONFIG.cappedAmount,
          currencyCode: BILLING_CONFIG.currencyCode,
          interval: BillingInterval.Usage,
          terms: tier.terms,
        },
      ],
      trialDays: BILLING_CONFIG.trialDays,
    },
  ]),
);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma, {
    // Wait longer for MySQL (XAMPP) to become ready after app boot.
    connectionRetries: 30,
    connectionRetryIntervalMs: 1000,
  }) as never,
  distribution: AppDistribution.AppStore,
  billing: usageBillingPlans as never,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      try {
        await shopify.registerWebhooks({ session });
      } catch (error) {
        console.warn("AddressVerify webhook registration skipped", error);
      }
      // ORDERS_CREATE is registered via Admin API (not shopify.app.toml) so Partner
      // Dashboard PCD preview does not block CLI app reloads.
      try {
        const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
        if (appUrl) {
          const { ensureOrdersCreateWebhook } = await import("./services/shopify-sync.server");
          await ensureOrdersCreateWebhook(admin, `${appUrl}/webhooks/orders/create`);
        }
      } catch (error) {
        console.warn("AddressVerify ORDERS_CREATE webhook skipped", error);
      }
      const bundle = await ensureShopDefaults(session.shop);
      try {
        await syncShopConfig(admin, session.shop, bundle);
      } catch (error) {
        console.error("AddressVerify afterAuth config sync failed", error);
      }
      try {
        await ensureValidationFunction(admin, session.shop);
      } catch (error) {
        console.warn("AddressVerify afterAuth function sync skipped", error);
      }
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
export { USAGE_PLAN_HANDLE };
