-- P2F-2: DB-backed rate limit for API integration endpoints
--
-- Phase 1 P0-17 added an in-memory sliding-window limiter for the
-- public /api/integrations/* endpoints. That works per-Vercel-function-
-- instance, so the actual ceiling across instances is roughly
-- (max * concurrent_instances). Acceptable for the abuse case but
-- imprecise.
--
-- This table + RPC moves the limiter into the DB so the cap is a
-- hard ceiling regardless of how many function instances are warm.
-- Each row tracks one key's window; a daily prune cleans up stale
-- rows.

CREATE TABLE IF NOT EXISTS public.api_key_rate_limits (
  key_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, window_start)
);

-- Partial index on the latest window per key for fast lookups.
CREATE INDEX IF NOT EXISTS idx_api_key_rate_limits_recent
  ON public.api_key_rate_limits (key_hash, window_start DESC);

-- Pessimistic atomic increment + check. Returns true if the request
-- is allowed (and increments the counter), false if the key is over
-- the limit for the current minute window.
CREATE OR REPLACE FUNCTION public.consume_api_key_rate_limit(
  p_key_hash TEXT,
  p_max_per_minute INTEGER DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_in_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  -- Round down to the minute. All requests in the same minute share
  -- a row; rollover happens automatically on the next minute boundary.
  v_window := date_trunc('minute', now());

  INSERT INTO public.api_key_rate_limits (key_hash, window_start, count)
  VALUES (p_key_hash, v_window, 1)
  ON CONFLICT (key_hash, window_start) DO UPDATE
    SET count = public.api_key_rate_limits.count + 1
  RETURNING count INTO v_count;

  IF v_count > p_max_per_minute THEN
    -- Over the limit. Roll back the increment so the count reflects
    -- only allowed requests.
    UPDATE public.api_key_rate_limits
       SET count = count - 1
     WHERE key_hash = p_key_hash AND window_start = v_window;
    RETURN QUERY
      SELECT false,
             0,
             GREATEST(0, EXTRACT(EPOCH FROM (v_window + INTERVAL '1 minute' - now())) * 1000)::INTEGER;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT true,
           p_max_per_minute - v_count,
           GREATEST(0, EXTRACT(EPOCH FROM (v_window + INTERVAL '1 minute' - now())) * 1000)::INTEGER;
END;
$$;

-- Daily prune: drop windows older than 1 hour. Kept generous so a
-- post-incident review can still see the rate-limit hits.
CREATE OR REPLACE FUNCTION public.prune_api_key_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.api_key_rate_limits
   WHERE window_start < now() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_key_rate_limit(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_api_key_rate_limit(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_api_key_rate_limit(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_key_rate_limit(TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.prune_api_key_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_api_key_rate_limits() TO service_role;

ALTER TABLE public.api_key_rate_limits ENABLE ROW LEVEL SECURITY;
-- Service-role only; no other path needs to see this table.
