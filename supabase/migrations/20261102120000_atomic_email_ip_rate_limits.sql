-- Atomically enforce recipient and source-IP quotas for public magic-link
-- endpoints. Identifiers are HMACed in the application before reaching this
-- function, so this table stores no raw email addresses or IP addresses.
CREATE OR REPLACE FUNCTION public.consume_api_key_rate_limits_windowed(
  p_key_hashes TEXT[],
  p_max_per_key INTEGER[],
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
  v_secs INTEGER;
  v_locks BIGINT[];
  v_lock BIGINT;
  v_key TEXT;
  v_max INTEGER;
  v_count INTEGER;
  v_remaining INTEGER := 2147483647;
  v_reset_ms INTEGER;
  v_i INTEGER;
BEGIN
  IF p_key_hashes IS NULL
     OR p_max_per_key IS NULL
     OR cardinality(p_key_hashes) = 0
     OR cardinality(p_key_hashes) <> cardinality(p_max_per_key)
     OR array_position(p_key_hashes, NULL) IS NOT NULL
     OR array_position(p_max_per_key, NULL) IS NOT NULL
     OR EXISTS (SELECT 1 FROM unnest(p_key_hashes) AS item(key_hash) WHERE key_hash = '')
     OR EXISTS (SELECT 1 FROM unnest(p_max_per_key) AS item(max_per_key) WHERE max_per_key < 1)
     OR (SELECT COUNT(*) FROM unnest(p_key_hashes) AS item(key_hash))
        <> (SELECT COUNT(DISTINCT key_hash) FROM unnest(p_key_hashes) AS item(key_hash)) THEN
    RAISE EXCEPTION 'Invalid rate-limit dimensions';
  END IF;

  v_secs := GREATEST(1, LEAST(86400, COALESCE(p_window_seconds, 60)));
  v_window := to_timestamp(
    FLOOR(EXTRACT(EPOCH FROM now()) / v_secs) * v_secs
  );
  v_reset_ms := GREATEST(
    0,
    EXTRACT(EPOCH FROM (v_window + (v_secs * INTERVAL '1 second') - now())) * 1000
  )::INTEGER;

  -- Serialize overlapping dimensions in a stable order. This makes the
  -- read/check/increment sequence atomic without deadlocking concurrent
  -- requests that share an email or IP in opposite dimension order.
  SELECT array_agg(lock_id ORDER BY lock_id)
    INTO v_locks
    FROM (
      SELECT DISTINCT hashtextextended(key_hash || ':' || v_window::TEXT, 0) AS lock_id
        FROM unnest(p_key_hashes) AS item(key_hash)
    ) AS ordered_locks;

  FOREACH v_lock IN ARRAY v_locks LOOP
    PERFORM pg_advisory_xact_lock(v_lock);
  END LOOP;

  -- Check every dimension before incrementing any of them. A denied IP
  -- request therefore cannot consume another recipient's email allowance.
  FOR v_i IN 1..cardinality(p_key_hashes) LOOP
    v_key := p_key_hashes[v_i];
    v_max := LEAST(1000000, p_max_per_key[v_i]);
    SELECT count INTO v_count
      FROM public.api_key_rate_limits
     WHERE key_hash = v_key AND window_start = v_window;
    v_count := COALESCE(v_count, 0);

    IF v_count >= v_max THEN
      RETURN QUERY SELECT false, 0, v_reset_ms;
      RETURN;
    END IF;
  END LOOP;

  FOR v_i IN 1..cardinality(p_key_hashes) LOOP
    v_key := p_key_hashes[v_i];
    INSERT INTO public.api_key_rate_limits (key_hash, window_start, count)
    VALUES (v_key, v_window, 1)
    ON CONFLICT (key_hash, window_start) DO UPDATE
      SET count = public.api_key_rate_limits.count + 1;
  END LOOP;

  FOR v_i IN 1..cardinality(p_key_hashes) LOOP
    v_key := p_key_hashes[v_i];
    v_max := LEAST(1000000, p_max_per_key[v_i]);
    SELECT count INTO v_count
      FROM public.api_key_rate_limits
     WHERE key_hash = v_key AND window_start = v_window;
    v_remaining := LEAST(v_remaining, v_max - COALESCE(v_count, 0));
  END LOOP;

  RETURN QUERY SELECT true, GREATEST(0, v_remaining), v_reset_ms;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_key_rate_limits_windowed(TEXT[], INTEGER[], INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_api_key_rate_limits_windowed(TEXT[], INTEGER[], INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_api_key_rate_limits_windowed(TEXT[], INTEGER[], INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_key_rate_limits_windowed(TEXT[], INTEGER[], INTEGER) TO service_role;
