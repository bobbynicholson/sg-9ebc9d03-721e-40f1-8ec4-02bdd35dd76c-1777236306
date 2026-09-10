-- Phase 4 #1: rate-limit RPC overload with a configurable window.
-- The original P2F-2 RPC was hard-coded to a 1-minute window, fine
-- for the /api/integrations/* endpoints but too narrow for paths
-- that want a longer "burst control" window (magic-link sends:
-- 5 / 10 minutes, password resets: 3 / hour, etc).
--
-- New overload: consume_api_key_rate_limit_windowed(hash, max, secs)
-- rolls the bucket on date_trunc against a custom window size in
-- seconds. The minute-granular version stays for the common case
-- and avoids a migration of every existing caller.

CREATE OR REPLACE FUNCTION public.consume_api_key_rate_limit_windowed(
  p_key_hash TEXT,
  p_max_per_window INTEGER,
  p_window_seconds INTEGER DEFAULT 60
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
  v_secs INTEGER;
BEGIN
  -- Clamp window to 1s-86400s so a buggy caller can't request a
  -- 10-year window and bloat the table.
  v_secs := GREATEST(1, LEAST(86400, p_window_seconds));
  -- Round 'now' down to the nearest window boundary: now - (now %
  -- window_seconds) on the epoch axis. This means every request in
  -- the same window collides on the same row.
  v_window := to_timestamp(
    FLOOR(EXTRACT(EPOCH FROM now()) / v_secs) * v_secs
  );

  INSERT INTO public.api_key_rate_limits (key_hash, window_start, count)
  VALUES (p_key_hash, v_window, 1)
  ON CONFLICT (key_hash, window_start) DO UPDATE
    SET count = public.api_key_rate_limits.count + 1
  RETURNING count INTO v_count;

  IF v_count > p_max_per_window THEN
    UPDATE public.api_key_rate_limits
       SET count = count - 1
     WHERE key_hash = p_key_hash AND window_start = v_window;
    RETURN QUERY
      SELECT false,
             0,
             GREATEST(
               0,
               EXTRACT(EPOCH FROM (v_window + (v_secs * INTERVAL '1 second') - now())) * 1000
             )::INTEGER;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT true,
           p_max_per_window - v_count,
           GREATEST(
             0,
             EXTRACT(EPOCH FROM (v_window + (v_secs * INTERVAL '1 second') - now())) * 1000
           )::INTEGER;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_key_rate_limit_windowed(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_api_key_rate_limit_windowed(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_api_key_rate_limit_windowed(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_key_rate_limit_windowed(TEXT, INTEGER, INTEGER) TO service_role;
