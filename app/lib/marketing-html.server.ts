import { readFile } from "node:fs/promises";
import path from "node:path";

export async function serveMarketingHtml(filename: string) {
  const filePath = path.join(process.cwd(), "public", filename);
  const html = await readFile(filePath, "utf8");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
