import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { serveMarketingHtml } from "../lib/marketing-html.server";

/**
 * App URL entry: Shopify install / admin opens with shop or host —
 * always enter the embedded app (OAuth) instead of the marketing site.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");
  const idToken = url.searchParams.get("id_token");

  if (shop || host || embedded === "1" || idToken) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return serveMarketingHtml("index.html");
};
