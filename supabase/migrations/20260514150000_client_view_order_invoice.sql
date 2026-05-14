-- Wave 19 audit: client_view_order didn't return any invoice context,
-- so the magic-link /c/order/[id] page couldn't render a "Pay deposit"
-- or "Pay balance" button -- the only way for a client to pay was
-- to dig out the deposit invoice email. Surface the live unpaid
-- invoice for the order so the front-end can drop a Pay link
-- straight into the payment summary card. Excludes soft-deleted +
-- already-paid + cancelled invoices so the link only shows when
-- there's money outstanding.

CREATE OR REPLACE FUNCTION public.client_view_order(p_token_hash text, p_order_id uuid, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token   RECORD;
  v_order   RECORD;
  v_company RECORD;
  v_items   jsonb;
  v_invoice jsonb;
BEGIN
  SELECT id, company_id, order_id, expires_at, revoked_at, scope, client_email
    INTO v_token
    FROM client_access_tokens
    WHERE token_hash = p_token_hash
      AND (
            (scope = 'order'  AND order_id = p_order_id)
         OR (scope = 'client')
          )
    ORDER BY (CASE WHEN scope = 'order' THEN 0 ELSE 1 END)
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

  SELECT
    id, order_number, event_name, event_date, event_time, guest_count,
    venue_name, venue_address, venue_contact_person, venue_contact_phone,
    special_instructions, dietary_requirements, subtotal, tax_amount,
    total_amount, payment_status, status, deposit_paid, deposit_amount,
    balance_amount, balance_paid, balance_due_date, currency,
    client_name, client_email, client_phone, company_id,
    created_at, confirmed_at
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
  END IF;

  IF v_token.scope = 'client' THEN
    IF v_token.company_id IS DISTINCT FROM v_order.company_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'wrong_company');
    END IF;
    IF v_token.client_email IS NULL OR
       lower(v_token.client_email) <> lower(COALESCE(v_order.client_email, '')) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'wrong_client');
    END IF;
  END IF;

  SELECT company_name, logo_url, primary_color, secondary_color, slug,
         email, phone, website, address_line1, city, country
  INTO v_company
  FROM companies
  WHERE id = v_order.company_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_name', item_name,
           'quantity',  quantity,
           'unit_price', unit_price,
           'line_total', line_total,
           'special_instructions', special_instructions
         ) ORDER BY item_name), '[]'::jsonb)
  INTO v_items
  FROM order_items WHERE order_id = p_order_id;

  SELECT jsonb_build_object(
    'id', id,
    'invoice_number', invoice_number,
    'public_token', public_token,
    'total_amount', total_amount,
    'amount_paid', amount_paid,
    'balance_due', balance_due,
    'status', status,
    'due_date', due_date
  )
  INTO v_invoice
  FROM invoices
  WHERE order_id = p_order_id
    AND deleted_at IS NULL
    AND status <> 'paid'
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO client_access_log (token_id, company_id, order_id, ip, user_agent, action)
  VALUES (v_token.id, v_order.company_id, p_order_id, p_ip, p_user_agent,
          CASE WHEN v_token.scope = 'client' THEN 'view_via_account' ELSE 'view' END);

  RETURN jsonb_build_object(
    'ok',      true,
    'order',   to_jsonb(v_order),
    'items',   v_items,
    'company', to_jsonb(v_company),
    'invoice', v_invoice,
    'token',   jsonb_build_object('expires_at', v_token.expires_at, 'scope', v_token.scope)
  );
END $function$;
