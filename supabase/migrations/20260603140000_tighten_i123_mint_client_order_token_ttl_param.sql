-- TIGHTEN I.123 (2026-06-03): make mint_client_order_token TTL
-- configurable per call.
--
-- The /q/{token} -> /c/order/{id} bridge mints a token the client
-- starts using immediately. Once they've landed and the cookie is
-- set, the email link in their inbox can re-bridge on every future
-- click. So we want SHORT TTL on bridge mints (24 hours) so cookies
-- expire promptly and the user is steered back to the canonical
-- email click instead of re-using a stale ?t= URL someone might
-- have screenshotted or shared.
--
-- Existing callers (status-change emails, "Preview as client",
-- smoke tests) keep the 60-day TTL by omitting the new param.
-- Bridge endpoint passes p_ttl_hours=24 explicitly.
--
-- Applied to live DB on 2026-06-03.

CREATE OR REPLACE FUNCTION public.mint_client_order_token(
  p_company_id uuid,
  p_order_id uuid,
  p_label text DEFAULT NULL,
  p_ttl_hours integer DEFAULT 1440
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id          uuid;
  v_raw         text;
  v_hash        text;
  v_prefix      text;
  v_order_short text;
  v_ttl_hours   integer;
BEGIN
  -- Clamp to [1, 1440] hours (1 hour minimum, 60 days maximum).
  v_ttl_hours := GREATEST(1, LEAST(1440, COALESCE(p_ttl_hours, 1440)));
  v_order_short := substr(replace(p_order_id::text, '-', ''), 1, 10);
  v_raw := 'ord_' || v_order_short || '_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');
  v_prefix := substr(v_raw, 1, 14);

  INSERT INTO client_access_tokens
    (company_id, order_id, token_hash, token_prefix, scope, expires_at, label)
  VALUES
    (p_company_id, p_order_id, v_hash, v_prefix, 'order',
     now() + make_interval(hours => v_ttl_hours),
     p_label)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'raw_token', v_raw, 'prefix', v_prefix);
END
$$;
