-- Wave 18 audit: client_view_account RPC's company payload was
-- missing the currency column, so the magic-link /c/account page
-- couldn't render order totals in the tenant's actual currency
-- (it fell back to a hardcoded ZAR formatter -> "R5,000" for any
-- UK / US / EU caterer). Add currency to the company SELECT so
-- the front-end has data to render against.

CREATE OR REPLACE FUNCTION public.client_view_account(p_token_hash text, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token   RECORD;
  v_orders  jsonb;
  v_company RECORD;
BEGIN
  SELECT id, company_id, client_email, expires_at, revoked_at
    INTO v_token
    FROM client_access_tokens
    WHERE token_hash = p_token_hash AND scope = 'client'
    LIMIT 1;

  IF v_token.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token');
  END IF;
  IF v_token.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'revoked');
  END IF;
  IF v_token.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',          o.id,
           'order_number', o.order_number,
           'event_name',  o.event_name,
           'event_date',  o.event_date,
           'event_time',  o.event_time,
           'guest_count', o.guest_count,
           'venue_name',  o.venue_name,
           'venue_address', o.venue_address,
           'status',      o.status,
           'payment_status', o.payment_status,
           'total_amount', o.total_amount,
           'currency',    o.currency
         ) ORDER BY o.event_date DESC), '[]'::jsonb)
  INTO v_orders
  FROM orders o
  WHERE o.company_id = v_token.company_id
    AND lower(o.client_email) = lower(v_token.client_email)
    AND o.deleted_at IS NULL;

  SELECT company_name, logo_url, primary_color, secondary_color, slug,
         email, phone, website, currency
  INTO v_company
  FROM companies WHERE id = v_token.company_id;

  INSERT INTO client_access_log (token_id, company_id, ip, user_agent, action)
  VALUES (v_token.id, v_token.company_id, p_ip, p_user_agent, 'view_account');

  RETURN jsonb_build_object(
    'ok', true,
    'orders', v_orders,
    'company', to_jsonb(v_company),
    'token', jsonb_build_object('expires_at', v_token.expires_at, 'client_email', v_token.client_email)
  );
END $function$;
