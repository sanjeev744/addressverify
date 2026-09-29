import { useRevalidator, useSearchParams } from "@remix-run/react";
import { useEffect } from "react";

const SHOP_KEY = "av_shop";
const HOST_KEY = "av_host";
/** Session JWTs expire ~60s; refresh before that while the tab is open. */
const KEEP_ALIVE_MS = 40_000;

/** Persist shop/host so /auth/login can recover after an idle iframe reload. */
export function persistEmbeddedShopContext(shop: string, host: string) {
  try {
    if (shop) sessionStorage.setItem(SHOP_KEY, shop);
    if (host) sessionStorage.setItem(HOST_KEY, host);
  } catch {
    // Private mode / blocked storage
  }
}

export function readEmbeddedShopContext() {
  try {
    return {
      shop: sessionStorage.getItem(SHOP_KEY) || "",
      host: sessionStorage.getItem(HOST_KEY) || "",
    };
  } catch {
    return { shop: "", host: "" };
  }
}

/**
 * Keeps the embedded session token fresh while the merchant leaves a page open,
 * and recovers shop/host into the URL when Shopify reloads the iframe without them.
 */
export function SessionKeepAlive({ shop }: { shop: string }) {
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const urlShop = searchParams.get("shop") || "";
    const urlHost = searchParams.get("host") || "";
    if (urlShop && urlHost) {
      persistEmbeddedShopContext(urlShop, urlHost);
      return;
    }

    const stored = readEmbeddedShopContext();
    const nextShop = urlShop || stored.shop || shop;
    const nextHost = urlHost || stored.host;
    if (nextShop && nextHost && (!urlShop || !urlHost)) {
      const next = new URLSearchParams(searchParams);
      next.set("shop", nextShop);
      next.set("host", nextHost);
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, shop]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (revalidator.state !== "idle") return;
      revalidator.revalidate();
    };

    const id = window.setInterval(tick, KEEP_ALIVE_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [revalidator]);

  return null;
}
