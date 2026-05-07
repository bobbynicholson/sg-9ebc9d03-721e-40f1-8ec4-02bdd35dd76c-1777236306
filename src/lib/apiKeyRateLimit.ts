/**
 * Per-API-key rate limiter for the public integration endpoints.
 *
 * Two implementations live here:
 *
 *  - consumeApiKeyRateLimit (in-memory, sync) -- the original P0-17
 *    sliding window. Per-Vercel-function-instance, so ceiling is
 *    roughly (max * concurrent_instances). Cheap, but imprecise.
 *
 *  - consumeApiKeyRateLimitDb (DB-backed, async) -- Phase 3 P2F-2.
 *    Calls public.consume_api_key_rate_limit RPC which atomically
 *    increments + checks against the per-minute window via INSERT
 *    ON CONFLICT. Hard ceiling regardless of instance count.
 *
 * Callers should prefer the DB-backed variant when a service-role
 * client is available; fall back to the in-memory one otherwise
 * (e.g. on a path that runs without DB access).
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

/**
 * DB-backed rate limit consumption [P2F-2]. Atomic via the
 * consume_api_key_rate_limit RPC. Pass a service-role Supabase
 * client. Returns the same shape as the in-memory version.
 *
 * On RPC error (network, RPC missing) the function falls back to
 * the in-memory limiter so a transient DB blip doesn't fail-open.
 */
export async function consumeApiKeyRateLimitDb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  keyHash: string,
  options: { maxPerMinute?: number } = {},
): Promise<RateLimitResult> {
  const max = options.maxPerMinute ?? 60;
  try {
    const { data, error } = await serviceClient.rpc("consume_api_key_rate_limit", {
      p_key_hash: keyHash,
      p_max_per_minute: max,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Empty rate-limit RPC response");
    return {
      allowed: !!row.allowed,
      remaining: Number(row.remaining ?? 0),
      resetInMs: Number(row.reset_in_ms ?? 60_000),
    };
  } catch (e) {
    // Fall back to in-memory so a DB hiccup doesn't fail-open the
    // limiter entirely. The in-memory ceiling is at-most (max *
    // instance_count) which is still bounded.
    console.warn("[consumeApiKeyRateLimitDb] falling back to in-memory:", e);
    return consumeApiKeyRateLimit(keyHash, options);
  }
}
