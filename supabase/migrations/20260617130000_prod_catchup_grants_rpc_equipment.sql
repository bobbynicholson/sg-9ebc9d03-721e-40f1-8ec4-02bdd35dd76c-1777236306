-- 20260617130000_prod_catchup_grants_rpc_equipment.sql
--
-- CATCH-UP / RECONCILIATION migration (2026-06-17).
--
-- During live e2e testing several flows failed in the app while working
-- fine in the SQL editor, or a repo fix "didn't take". Root cause each
-- time: a migration/grant present in the repo was never applied to the
-- live (spit-braai-delivery) DB, because migrations are applied by hand.
--
-- This single migration re-asserts the three that were found missing.
-- EVERYTHING here is idempotent and SAFE TO RE-RUN even if a section was
-- already applied (grants are idempotent, CREATE OR REPLACE replaces in
-- place, ADD COLUMN uses IF NOT EXISTS). Run the whole file in the
-- Supabase SQL editor.
--
--   §0  Enum values used by the payment / convert flows  (fixes: accepting
--       a quote with "Client has already paid the deposit" ticked errors +
--       loses the deposit - convert_quote_to_order casts payment_status /
--       payment_method via jsonb_populate_record, so a value missing from
--       the live enum fails the whole order INSERT. Idempotent, no-op if
--       already present).
--   §1  Client-portal RPC EXECUTE grants  (fixes: "Client link" /
--       "View as client sees it" 500 every time - the app calls
--       client_view_order/account with the anon key, which had lost
--       EXECUTE so every call errored while privileged SQL worked).
--   §2  record_invoice_payment no-auto-complete  (fixes: "Mark all paid"
--       warning it will CLOSE the order, then a generic error - the old
--       RPC force-flipped orders.status to 'completed' on zero balance,
--       breaking prep/dispatch and tripping an AFTER UPDATE trigger).
--   §3  equipment_damages / equipment_handovers columns  (fixes: cleaning
--       portal "Flag damage" / handover-receipt 500s - code writes
--       columns the live tables never had).


-- ─────────────────────────────────────────────────────────────────────
-- §0  Enum values used by the payment / convert flows
-- ─────────────────────────────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent and is allowed inside
-- a transaction on PG12+ (Supabase) AS LONG AS the new value isn't *used* in
-- the same transaction. Nothing below uses these at runtime (the function in
-- §2 only references them in its body, which is evaluated at call time), so
-- this is safe in one run. If your SQL editor still objects, run these five
-- lines on their own first, then run the rest of the file.
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'eft';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'other';


-- ─────────────────────────────────────────────────────────────────────
-- §1  Client-portal RPC EXECUTE grants
-- ─────────────────────────────────────────────────────────────────────
-- Signature-agnostic: grant EXECUTE on every overload of these functions
-- to the roles the app actually uses, so we don't have to hard-code arg
-- lists (and so this can't error on a signature mismatch). The functions
-- are SECURITY DEFINER and validate the token hash internally - the token
-- IS the auth, so anon EXECUTE is the intended, safe state.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('client_view_order', 'client_view_account')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- §2  record_invoice_payment - stop auto-closing the order
--     (verbatim from 20260514240000_record_invoice_payment_no_auto_complete)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id        uuid,
  p_amount            numeric,
  p_payment_method    text,
  p_transaction_id    text DEFAULT NULL::text,
  p_company_id        uuid DEFAULT NULL::uuid,
  p_client_id         uuid DEFAULT NULL::uuid,
  p_currency          text DEFAULT 'ZAR'::text,
  p_gateway_provider  text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_payment_id uuid;
  v_new_payment_id      uuid;
  v_invoice             RECORD;
  v_pre_amount_paid     numeric;
  v_pre_total           numeric;
  v_post_amount_paid    numeric;
  v_post_balance_due    numeric;
  v_next_status         public.invoice_status;
  v_order_payment_status public.payment_status;
BEGIN
  -- Idempotency: if this gateway transaction was already recorded,
  -- short-circuit.
  IF p_transaction_id IS NOT NULL THEN
    SELECT id
      INTO v_existing_payment_id
      FROM public.payments
     WHERE invoice_id = p_invoice_id
       AND (gateway_transaction_id = p_transaction_id OR transaction_id = p_transaction_id)
     LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      SELECT id, order_id, invoice_number, status, total_amount, client_id, company_id
        INTO v_invoice
        FROM public.invoices
       WHERE id = p_invoice_id;
      RETURN jsonb_build_object(
        'idempotent',     true,
        'payment_id',     v_existing_payment_id,
        'invoice_id',     v_invoice.id,
        'order_id',       v_invoice.order_id,
        'invoice_number', v_invoice.invoice_number,
        'invoice_status', v_invoice.status::text,
        'order_completed', false
      );
    END IF;
  END IF;

  -- Snapshot + lock the invoice row.
  SELECT amount_paid, total_amount
    INTO v_pre_amount_paid, v_pre_total
    FROM public.invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  v_post_amount_paid := COALESCE(v_pre_amount_paid, 0) + p_amount;
  v_post_balance_due := GREATEST(0, COALESCE(v_pre_total, 0) - v_post_amount_paid);

  IF v_post_balance_due < 0.01 THEN
    v_next_status := 'paid'::public.invoice_status;
  ELSIF v_post_amount_paid > 0 THEN
    v_next_status := 'partially_paid'::public.invoice_status;
  ELSE
    v_next_status := 'sent'::public.invoice_status;
  END IF;

  -- Step 1: insert the payment row.
  INSERT INTO public.payments (
    invoice_id, amount, payment_method,
    gateway_transaction_id, transaction_id, payment_reference,
    payment_status, processed_at, completed_at, created_at,
    company_id, client_id, currency, gateway, gateway_provider
  )
  VALUES (
    p_invoice_id, p_amount, p_payment_method,
    p_transaction_id, p_transaction_id, p_transaction_id,
    'completed', now(), now(), now(),
    p_company_id, p_client_id, p_currency, p_gateway_provider, p_gateway_provider
  )
  RETURNING id INTO v_new_payment_id;

  -- Step 2: update the invoice.
  UPDATE public.invoices
     SET status      = v_next_status,
         amount_paid = v_post_amount_paid,
         balance_due = v_post_balance_due,
         paid_at = CASE
                     WHEN v_next_status = 'paid'::public.invoice_status THEN COALESCE(paid_at, now())
                     ELSE paid_at
                   END,
         updated_at  = now()
   WHERE id = p_invoice_id
  RETURNING id, order_id, invoice_number, status, total_amount, client_id, company_id
    INTO v_invoice;

  -- Step 3: update orders.payment_status ONLY -- NEVER touch
  -- orders.status. Order completion is a separate workflow (driver flips
  -- to 'delivered' -> post-event finalisation).
  IF v_invoice.order_id IS NOT NULL THEN
    IF v_next_status = 'paid'::public.invoice_status THEN
      v_order_payment_status := 'paid'::public.payment_status;
    ELSE
      v_order_payment_status := 'partial'::public.payment_status;
    END IF;
    UPDATE public.orders
       SET payment_status = v_order_payment_status,
           updated_at     = now()
     WHERE id = v_invoice.order_id;
  END IF;

  RETURN jsonb_build_object(
    'idempotent',     false,
    'payment_id',     v_new_payment_id,
    'invoice_id',     v_invoice.id,
    'order_id',       v_invoice.order_id,
    'invoice_number', v_invoice.invoice_number,
    'invoice_status', v_invoice.status::text,
    'amount_paid',    v_post_amount_paid,
    'balance_due',    v_post_balance_due,
    'order_completed', false
  );
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────
-- §3  equipment_damages / equipment_handovers schema
--     (verbatim from 20260615120000_fix_equipment_damages_handovers_schema)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.equipment_damages
  ADD COLUMN IF NOT EXISTS quantity_damaged    integer       NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS damage_stage        text,
  ADD COLUMN IF NOT EXISTS unit_cost           numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid,
  ADD COLUMN IF NOT EXISTS responsible_name    text,
  ADD COLUMN IF NOT EXISTS description         text,
  ADD COLUMN IF NOT EXISTS photo_url           text,
  ADD COLUMN IF NOT EXISTS resolution_notes    text,
  ADD COLUMN IF NOT EXISTS resolved_at         timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_equipment_damages_company_created
  ON public.equipment_damages (company_id, created_at DESC);

ALTER TABLE public.equipment_handovers
  ADD COLUMN IF NOT EXISTS company_id          uuid,
  ADD COLUMN IF NOT EXISTS equipment_id        uuid,
  ADD COLUMN IF NOT EXISTS received_at         timestamptz,
  ADD COLUMN IF NOT EXISTS quantity_received   integer,
  ADD COLUMN IF NOT EXISTS discrepancy_noted   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discrepancy_reason  text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_handovers_equipment_id_fkey'
  ) THEN
    ALTER TABLE public.equipment_handovers
      ADD CONSTRAINT equipment_handovers_equipment_id_fkey
      FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipment_handovers_company_stage_received
  ON public.equipment_handovers (company_id, to_stage, received_at);
