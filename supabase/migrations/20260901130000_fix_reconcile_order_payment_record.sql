-- Repair the payment reconciliation function for databases where the
-- previous migration was already applied. The earlier function used a
-- RECORD snapshot and some deployed definitions did not include
-- balance_amount, causing the repair DO block to fail with:
--   record "v_order" has no field "balance_amount"
-- Keep the snapshot in named variables so its shape cannot drift.

CREATE OR REPLACE FUNCTION public.reconcile_order_payment_totals(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_amount numeric;
  v_amount_paid numeric;
  v_deposit_amount numeric;
  v_deposit_paid_existing boolean;
  v_balance_amount_existing numeric;
  v_balance_paid_existing boolean;
  v_payment_status_existing text;
  v_paid numeric := 0;
  v_has_ledger boolean := false;
  v_balance numeric := 0;
  v_status text;
  v_deposit_paid boolean;
BEGIN
  SELECT total_amount, amount_paid, deposit_amount, deposit_paid,
         balance_amount, balance_paid, payment_status::text
    INTO v_total_amount, v_amount_paid, v_deposit_amount,
         v_deposit_paid_existing, v_balance_amount_existing,
         v_balance_paid_existing, v_payment_status_existing
    FROM public.orders
   WHERE id = p_order_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (
           SELECT 1
             FROM public.payments p
            WHERE p.payment_status = 'completed'
              AND (
                p.order_id = p_order_id
                OR EXISTS (
                  SELECT 1
                    FROM public.invoices i
                   WHERE i.id = p.invoice_id
                     AND i.order_id = p_order_id
                )
              )
         ),
         COALESCE(SUM(
           CASE
             WHEN lower(COALESCE(p.payment_type, '')) = 'refund'
               THEN -abs(COALESCE(p.amount, 0))
             WHEN lower(COALESCE(p.payment_type, '')) = 'credit_issue'
               THEN 0
             ELSE COALESCE(p.amount, 0)
           END
         ), 0)
    INTO v_has_ledger, v_paid
    FROM public.payments p
   WHERE p.payment_status = 'completed'
     AND (
       p.order_id = p_order_id
       OR EXISTS (
         SELECT 1
           FROM public.invoices i
          WHERE i.id = p.invoice_id
            AND i.order_id = p_order_id
       )
     );

  IF NOT v_has_ledger THEN
    v_paid := GREATEST(
      0,
      COALESCE(v_amount_paid, 0),
      CASE WHEN COALESCE(v_deposit_paid_existing, false)
        THEN COALESCE(v_deposit_amount, 0) ELSE 0 END,
      CASE WHEN COALESCE(v_balance_paid_existing, false)
        THEN COALESCE(v_balance_amount_existing, 0) ELSE 0 END,
      CASE WHEN v_payment_status_existing = 'paid'
        THEN COALESCE(v_total_amount, 0) ELSE 0 END
    );
  END IF;

  v_paid := round(GREATEST(v_paid, 0), 2);
  v_balance := round(GREATEST(COALESCE(v_total_amount, 0) - v_paid, 0), 2);

  IF COALESCE(v_payment_status_existing, '') IN ('refunded', 'partially_refunded') THEN
    v_status := v_payment_status_existing;
  ELSIF COALESCE(v_total_amount, 0) > 0
    AND round(v_paid * 100) >= round(COALESCE(v_total_amount, 0) * 100) THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'pending';
  END IF;

  v_deposit_paid := CASE
    WHEN COALESCE(v_deposit_amount, 0) > 0
      THEN round(v_paid * 100) >= round(v_deposit_amount * 100)
    ELSE v_paid > 0
  END;

  UPDATE public.orders
     SET amount_paid = v_paid,
         balance_amount = v_balance,
         balance_paid = (COALESCE(v_total_amount, 0) > 0 AND v_balance <= 0.01),
         deposit_paid = v_deposit_paid,
         payment_status = v_status::public.payment_status,
         updated_at = now()
   WHERE id = p_order_id;
END;
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE deleted_at IS NULL LOOP
    PERFORM public.reconcile_order_payment_totals(r.id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
