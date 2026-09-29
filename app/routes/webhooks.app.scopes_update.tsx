import type { ActionFunctionArgs } from "@remix-run/node";
import { webhookOk } from "../lib/webhook-response";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`, payload);
  if (session) {
    // Offline session remains valid; scopes are refreshed on next auth.
  }
  return webhookOk();
};
