import { serveMarketingHtml } from "../lib/marketing-html.server";

export const loader = () => serveMarketingHtml("privacy-policy.html");
