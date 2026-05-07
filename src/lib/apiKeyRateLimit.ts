/**
 * Per-API-key rate limiter for the public integration endpoints.
 *
 * Sliding window, in-memory. Keyed by API key hash so a leaked key
 * can't pollute the platform without bound. The buckets are per-Vercel-
 * function-instance so the actual ceiling across instances is roughly
 * (max_per_minute * concurrent_instances), which is acceptable for the
 * abuse case we're guarding (a leaked key that gets weaponised). A
 * DB-backed rate limit table is the right Phase 2 follow-up. [P0-17]
 */

interface Bucket {
  windowStartMs: number;
  count: number;
}

const BUCKETS = new Map<string, Bucket>();

// Drop entries older than 5 minutes on every check so the map doesn't
// grow without bound under churn.
function gcExpired(nowMs: number) {
  for (const [k, b] of BUCKETS) {
    if (nowMs - b.windowStartMs > 5 * 60_000) {
      BUCKETS.delete(k);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * Reserve one slot for `keyHash` in the rolling 60-second window.
 * Default ceiling is 60 requests / minute / key.
 */
export function consumeApiKeyRateLimit(
  keyHash: string,
  options: { maxPerMinute?: number } = {},
): RateLimitResult {
  const max = options.maxPerMinute ?? 60;
  const nowMs = Date.now();
  gcExpired(nowMs);

  let bucket = BUCKETS.get(keyHash);
  if (!bucket || nowMs - bucket.windowStartMs >= 60_000) {
    bucket = { windowStartMs: nowMs, count: 0 };
    BUCKETS.set(keyHash, bucket);
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: Math.max(0, 60_000 - (nowMs - bucket.windowStartMs)),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: max - bucket.count,
    resetInMs: Math.max(0, 60_000 - (nowMs - bucket.windowStartMs)),
  };
}
