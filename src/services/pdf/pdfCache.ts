/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * pdfCache - in-memory LRU for rendered PDF buffers.
 *
 * Why: @react-pdf/renderer's pdf().toBuffer() takes 200-500 ms per
 * document. The "admin clicks Send twice" pattern paid that cost on
 * every click. Cache by a key that mixes the entity id with its
 * updated_at so we never serve a stale buffer - if the underlying
 * row changed, the key changes too.
 *
 * Scope: process-local Map. On Vercel serverless this is per-instance
 * and dies on cold start. Good enough - the cache only has to
 * survive within a single warm invocation. We don't try to share
 * across instances; doing so would need Redis or similar and the
 * win isn't worth the dependency.
 *
 * Eviction: TTL on read (drop expired entries when we look) and a
 * size cap on write (drop oldest entries when we exceed MAX_ENTRIES).
 * Both are O(n) but n <= 50 so it's cheap.
 */

interface CacheEntry {
  buffer: Buffer;
  renderedAt: number;
  key: string;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 50;

// Map preserves insertion order, which gives us trivially correct
// "drop the oldest" semantics on writes.
const store: Map<string, CacheEntry> = new Map();

export type PdfCacheKind = "quote" | "invoice";

export interface PdfCacheLookupResult {
  hit: boolean;
  buffer?: Buffer;
  ageMs?: number;
}

/**
 * Look up a key in the cache. Drops the entry if it's older than
 * TTL_MS so callers always get a fresh buffer or a miss.
 */
export function pdfCacheGet(key: string): PdfCacheLookupResult {
  const entry = store.get(key);
  if (!entry) return { hit: false };
  const age = Date.now() - entry.renderedAt;
  if (age > TTL_MS) {
    store.delete(key);
    return { hit: false };
  }
  // Refresh insertion order so frequently used keys don't get evicted.
  store.delete(key);
  store.set(key, entry);
  return { hit: true, buffer: entry.buffer, ageMs: age };
}

/**
 * Insert a rendered buffer into the cache. Trims to MAX_ENTRIES by
 * dropping the oldest entry whenever we'd exceed the cap.
 */
export function pdfCacheSet(key: string, buffer: Buffer): void {
  // If the key already exists, delete it first so the re-insert
  // bumps it to the most-recent slot in iteration order.
  if (store.has(key)) {
    store.delete(key);
  }
  store.set(key, { buffer, renderedAt: Date.now(), key });
  while (store.size > MAX_ENTRIES) {
    // Map iterators yield in insertion order, so the first key is
    // the oldest. .next().value gives us [key, value] - we only
    // need the key.
    const oldest = store.keys().next().value;
    if (!oldest) break;
    store.delete(oldest);
  }
}

/**
 * Build a cache key for a quote render. Mixes quoteId + the quote's
 * updated_at + the company's updated_at so any branding or content
 * change automatically invalidates without us having to track it.
 *
 * Falsey timestamps degrade to "0" so unmigrated rows still produce a
 * stable key (just one that won't match a future render after the
 * row gains its first updated_at value).
 */
export function buildQuoteCacheKey(
  quoteId: string,
  quoteUpdatedAt: string | null | undefined,
  companyUpdatedAt: string | null | undefined,
): string {
  return `quote:${quoteId}:${quoteUpdatedAt || "0"}:${companyUpdatedAt || "0"}`;
}

/**
 * Build a cache key for an invoice render. Same idea as the quote
 * key but folds in the order's updated_at as well - an invoice's
 * line items reflect the order, so an order edit must invalidate.
 */
export function buildInvoiceCacheKey(
  invoiceId: string,
  invoiceUpdatedAt: string | null | undefined,
  orderUpdatedAt: string | null | undefined,
  companyUpdatedAt: string | null | undefined,
): string {
  return `invoice:${invoiceId}:${invoiceUpdatedAt || "0"}:${orderUpdatedAt || "0"}:${companyUpdatedAt || "0"}`;
}

/**
 * Test-only: wipe the cache. Not exported via the index, so callers
 * outside the test surface shouldn't reach for it.
 */
export function _resetPdfCache(): void {
  store.clear();
}
