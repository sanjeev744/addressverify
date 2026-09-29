import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { processDueJobs } from "../services/jobs.server";

function authorized(request: Request) {
  const expected = process.env.SHOPIFY_API_SECRET || "";
  const header = request.headers.get("x-addressverify-job-key") || "";
  return Boolean(expected) && header === expected;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const processed = await processDueJobs(25);
  return json({ processed });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const processed = await processDueJobs(25);
  return json({ processed });
};
