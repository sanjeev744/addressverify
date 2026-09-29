import type { ActionFunctionArgs } from "@remix-run/node";
import { webhookOk } from "../lib/webhook-response";
import { enqueueJob, processDueJobs } from "../services/jobs.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await enqueueJob(shop, "order_created", payload);
  processDueJobs().catch((error) => console.error("AddressVerify job drain failed", error));
  return webhookOk();
};
