import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const origin = new URL(request.url).origin;
  const body = `User-agent: *
Allow: /
Allow: /faq
Allow: /tutorial
Allow: /documentation
Allow: /docs
Allow: /pricing
Allow: /about
Allow: /privacy-policy
Allow: /index.html
Allow: /faq.html
Allow: /tutorial.html
Allow: /documentation.html
Allow: /pricing.html
Allow: /about.html
Allow: /privacy-policy.html
Allow: /css/
Allow: /js/
Allow: /images/
Allow: /favicon.ico
Allow: /favicon.svg
Allow: /favicon.png
Allow: /apple-touch-icon.png
Allow: /site.webmanifest
Allow: /sitemap.xml
Allow: /robots.txt
Disallow: /app
Disallow: /app/
Disallow: /auth
Disallow: /auth/
Disallow: /api
Disallow: /api/
Disallow: /webhooks
Disallow: /webhooks/
Disallow: /graphiql

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
