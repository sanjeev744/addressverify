export function storeHandle(shop: string) {
  return shop.replace(/\.myshopify\.com$/i, "");
}

export function checkoutEditorUrl(
  shop: string,
  page: "checkout" | "thank-you" | "order-status",
) {
  return `https://admin.shopify.com/store/${storeHandle(shop)}/settings/checkout/editor?page=${page}&context=apps`;
}

export const LITE_RULE_KEYS = [
  "require_house_number",
  "block_po_boxes",
  "block_special_characters",
] as const;

export function isLiteRule(ruleKey: string) {
  return (LITE_RULE_KEYS as readonly string[]).includes(ruleKey);
}
