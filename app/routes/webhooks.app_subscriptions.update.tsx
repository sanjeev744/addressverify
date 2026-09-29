import type { ActionFunctionArgs } from "@remix-run/node";
import { webhookOk } from "../lib/webhook-response";
import { refreshUsageLineItem } from "../services/billing.server";
import { authenticate, unauthenticated } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  try {
    const { admin } = await unauthenticated.admin(shop);
    await refreshUsageLineItem(shop, admin);
  } catch (error) {
    console.error("AddressVerify subscription refresh failed", error);
  }
  return webhookOk();
};
