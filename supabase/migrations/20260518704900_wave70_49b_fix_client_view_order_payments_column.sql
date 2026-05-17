-- Wave 70.49b -- fix the client_view_order RPC.
--
-- The RPC referenced `payments.status` but the real column is
-- `payments.payment_status`. Every call to the RPC has been silently
-- 42703-erroring ("column status does not exist"), making the entire
-- client magic-link flow broken end-to-end. /api/client-tokens/validate
-- and /api/client-tokens/view both surfaced this as a 500 "Lookup
-- failed", and /c/order/[id].tsx rendered the catch-all "We couldn't
-- verify this booking link" error.
--
-- Caught by Bobby's manual test of the Client view button after the
-- Wave 70.48c URL fix landed -- the URL had a valid token, the token
-- hashed to the stored hash (verified via direct SQL), but the RPC
-- still returned an error. Tracing showed the RPC body itself was the
-- bug.
--
-- This is bug #5 surfaced in this audit cycle. Same pattern as the
-- Wave 70.48b bugs (kitchen_prep_tasks check constraint,
-- outgoing_email_queue.updated_at) and 70.48c (actual_delivery_time):
-- SQL referencing columns that don't exist on the table being
-- queried. The smoke + Bobby's eyes are doing what no other test
-- harness in the codebase has been doing -- exercising real flows
-- and surfacing the silent schema drift.

CREATE OR REPLACE FUNCTION public.client_view_order(
  p_token_hash text,
  p_order_id uuid,
  p_ip text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token       RECORD;
  v_order       RECORD;
  v_company     RECORD;
  v_items       jsonb;
  v_invoice     jsonb;
  v_payments    jsonb;
  v_assignments jsonb;
  v_prep_tasks  jsonb;
  v_bookings    jsonb;
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
    id, order_number, event_name, event_date, event_time, setup_time,
    guest_count, venue_name, venue_address, venue_contact_person,
    venue_contact_phone, special_instructions, dietary_requirements,
    subtotal, tax_amount, tax, discount_amount, delivery_fee,
    delivery_distance_km, delivery_rate_per_km, total_amount,
    payment_status, status, deposit_paid, deposit_amount,
    deposit_paid_at, balance_amount, balance_paid, balance_paid_at,
    balance_due_date, currency, client_name, client_email,
    client_phone, company_id, created_at, confirmed_at, ready_at,
    picked_up_at, delivered_at, completed_at, departed_venue_at,
    setup_started_at, service_started_at, arrived_at_venue_at,
    equipment_return_method, quote_id
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
    AND status NOT IN ('paid', 'written_off')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Wave 70.49b -- payments.status -> payments.payment_status. The
  -- old reference silently crashed the RPC. Result key is kept as
  -- 'status' so the front-end's existing payment-status reader keeps
  -- working without a parallel change.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'payment_type', payment_type,
           'status', payment_status,
           'processed_at', processed_at,
           'amount', amount
         ) ORDER BY processed_at), '[]'::jsonb)
  INTO v_payments
  FROM payments WHERE order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'assignment_type', assignment_type,
           'status', status,
           'accepted_at', accepted_at,
           'completed_at', completed_at,
           'created_at', created_at
         ) ORDER BY created_at), '[]'::jsonb)
  INTO v_assignments
  FROM driver_assignments WHERE order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'status', status,
           'started_at', started_at,
           'completed_at', completed_at
         )), '[]'::jsonb)
  INTO v_prep_tasks
  FROM kitchen_prep_tasks WHERE order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'status', status,
           'returned_quantity', returned_quantity
         )), '[]'::jsonb)
  INTO v_bookings
  FROM equipment_bookings WHERE order_id = p_order_id;

  INSERT INTO client_access_log (token_id, company_id, order_id, ip, user_agent, action)
  VALUES (v_token.id, v_order.company_id, p_order_id, p_ip, p_user_agent,
          CASE WHEN v_token.scope = 'client' THEN 'view_via_account' ELSE 'view' END);

  RETURN jsonb_build_object(
    'ok',                  true,
    'order',               to_jsonb(v_order),
    'items',               v_items,
    'company',             to_jsonb(v_company),
    'invoice',             v_invoice,
    'payments',            v_payments,
    'driver_assignments',  v_assignments,
    'kitchen_prep_tasks',  v_prep_tasks,
    'equipment_bookings',  v_bookings,
    'token',               jsonb_build_object('expires_at', v_token.expires_at, 'scope', v_token.scope)
  );
END $function$;
