import type { ActionFunctionArgs } from "@remix-run/node";
import { webhookOk } from "../lib/webhook-response";
import { deleteShopData } from "../services/shop.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await deleteShopData(shop);
  }
  return webhookOk();
};
