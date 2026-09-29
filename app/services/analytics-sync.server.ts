import prisma from "../db.server";
import { rangeFromPreset, type DatePreset } from "../lib/defaults";
import { recordValidation } from "./logs.server";
import {
  ensureShopDefaults,
  toMerchantRules,
  toMessages,
  toPoBoxRules,
  toProviderConfig,
  toTranslations,
} from "./shop.server";
import { listOrdersForValidation } from "./shopify-sync.server";
import { validateAddress } from "./validation/engine";
import { normalizeAddress, type ValidationResult } from "./validation/types";

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

/**
 * Pull recent Shopify orders into ValidationLog so dashboard "Checked" reflects real order volume.
 * Does not create holds/tags and never creates billing rows: only orders AddressVerify actually
 * processed (orders/create webhook or checkout extension) are billable.
 */
export async function syncOrdersIntoAnalytics(
  shop: string,
  admin: AdminClient,
  preset: DatePreset,
  start?: string,
  end?: string,
) {
  const { from, to } = rangeFromPreset(preset, start, end);
  let nodes: Array<Record<string, unknown>> = [];
  try {
    nodes = await listOrdersForValidation(admin, from, to, 50);
  } catch (error) {
    console.warn("AddressVerify analytics order sync skipped", error);
    return { synced: 0, skipped: 0 };
  }

  const bundle = await ensureShopDefaults(shop);
  let synced = 0;
  let skipped = 0;

  for (const node of nodes) {
    const orderName = String(node.name || "");
    const orderId = String(node.id || "");
    if (!orderName && !orderId) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.validationLog.findFirst({
      where: {
        shop,
        OR: [
          ...(orderName ? [{ orderRef: orderName }] : []),
          ...(orderId ? [{ orderRef: orderId }] : []),
        ],
      },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const shipping = (node.shippingAddress || null) as {
      address1?: string;
      address2?: string;
      city?: string;
      provinceCode?: string;
      zip?: string;
      countryCodeV2?: string;
    } | null;

    const address = normalizeAddress({
      address1: shipping?.address1,
      address2: shipping?.address2,
      city: shipping?.city,
      province: shipping?.provinceCode,
      zip: shipping?.zip,
      country: shipping?.countryCodeV2,
    });

    const customerId = (node.customer as { id?: string } | null)?.id || null;
    let result: ValidationResult | null = null;

    if (address.address1 || address.zip) {
      try {
        result = await validateAddress(address, {
          shop,
          rules: toMerchantRules(bundle.rules),
          messages: toMessages(bundle.messages),
          translations: toTranslations(bundle.translations),
          provider: toProviderConfig(bundle.settings),
          failClosed: false,
          validationEnabled: bundle.settings.validationEnabled,
          poBoxRules: toPoBoxRules(bundle.poBoxRules),
          context: {},
        });
      } catch (error) {
        console.warn("AddressVerify analytics validate failed", orderName, error);
      }
    }

    if (!result) {
      result = {
        valid: true,
        status: "valid",
        confidence: 0.5,
        errorTypes: [],
        issues: [],
        suggested: undefined,
        normalized: address,
        provider: "order_sync",
        actionTaken: "allow",
      };
    }

    await recordValidation({
      shop,
      result,
      original: address,
      orderRef: orderName || orderId,
      customerId,
      source: "order_sync",
      correctedAutomatically: result.actionTaken === "fix" || result.status === "corrected",
      reviewRequired: result.actionTaken === "review",
    });
    synced += 1;
  }

  return { synced, skipped };
}
