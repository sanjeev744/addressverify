/** Shopify App Store automated checks expect 201 on valid webhook HMAC. */
export function webhookOk(body?: BodyInit | null, init?: ResponseInit) {
  return new Response(body ?? null, {
    status: 201,
    ...init,
    headers: body
      ? {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        }
      : init?.headers,
  });
}
