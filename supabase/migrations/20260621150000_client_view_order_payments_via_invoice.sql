-- client_view_order: include payments linked to the order's INVOICE, not
-- just payments with order_id set.
--
-- WHY: record_invoice_payment (the deposit / balance recording path) writes
-- payment rows with invoice_id set but order_id NULL. The previous payments
-- subquery filtered on order_id = p_order_id only, so a paid deposit never
-- appeared in the client order view's payments array - the client couldn't
-- see "R7001 deposit paid on 21 Jun". The deposit_paid flag carried the
-- timeline, but the itemised payment history was empty.
--
-- This re-applies client_view_order (carrying forward the collection_fee +
-- payment_status fixes from 20260621120000) with the payments subquery
-- widened to: order_id = p_order_id OR invoice_id IN (the order's invoices).
-- Idempotent CREATE OR REPLACE - safe to run anytime.

CREATE OR REPLACE FUNCTION public.client_view_order(
  p_token_hash text,
  p_order_id   uuid,
  p_ip         text DEFAULT NULL::text,
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
    delivery_distance_km, delivery_rate_per_km,
    collection_fee, collection_distance_km, collection_rate_per_km,
    total_amount,
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

  -- payments.status does NOT exist; the column is payment_status. The
  -- result key stays 'status' so the front-end reader is unchanged.
  -- Widened: a deposit recorded via record_invoice_payment has invoice_id
  -- set but order_id NULL, so also pull payments tied to ANY invoice of
  -- this order. DISTINCT guards against a payment that matches both legs.
  SELECT COALESCE(jsonb_agg(pmt ORDER BY pmt->>'processed_at'), '[]'::jsonb)
  INTO v_payments
  FROM (
    SELECT DISTINCT ON (p.id) jsonb_build_object(
             'payment_type', p.payment_type,
             'status', p.payment_status,
             'processed_at', p.processed_at,
             'amount', p.amount
           ) AS pmt
    FROM payments p
    WHERE p.order_id = p_order_id
       OR p.invoice_id IN (SELECT id FROM invoices WHERE order_id = p_order_id)
  ) q;

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
