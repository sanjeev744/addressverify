import { formatAddress, type AddressInput, type ValidationResult } from "./types";

const TTL_MS = 10 * 60 * 1000;
/** Keys come from customer-entered addresses, so the cache must stay bounded. */
const MAX_ENTRIES = 5000;
const store = new Map<string, { expires: number; result: ValidationResult }>();

/** Small stable string hash (FNV-1a) so config changes produce a new cache key. */
export function fingerprint(value: unknown) {
  const text = JSON.stringify(value) ?? "";
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function cacheKey(shop: string, address: AddressInput, extra = "") {
  return `${shop}:${formatAddress(address).toLowerCase()}:${extra}`;
}

export function getCachedResult(key: string) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.result;
}

export function setCachedResult(key: string, result: ValidationResult) {
  if (result.status === "unavailable") return;
  if (store.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [existingKey, entry] of store) {
      if (entry.expires < now) store.delete(existingKey);
    }
    // Still full: drop the oldest insertions (Map preserves insertion order).
    const overflow = store.size - MAX_ENTRIES + 1;
    if (overflow > 0) {
      let removed = 0;
      for (const existingKey of store.keys()) {
        if (removed >= overflow) break;
        store.delete(existingKey);
        removed += 1;
      }
    }
  }
  store.set(key, { expires: Date.now() + TTL_MS, result });
}
