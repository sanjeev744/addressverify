import type { LoaderFunctionArgs } from "@remix-run/node";

const PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "weekly", priority: "0.9" },
  { path: "/tutorial", changefreq: "monthly", priority: "0.8" },
  { path: "/documentation", changefreq: "monthly", priority: "0.85" },
  { path: "/faq", changefreq: "monthly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/privacy-policy", changefreq: "yearly", priority: "0.4" },
];

export const loader = ({ request }: LoaderFunctionArgs) => {
  const origin = new URL(request.url).origin;
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map(
    (page) => `  <url>
    <loc>${origin}${page.path === "/" ? "/" : page.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  ).join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
