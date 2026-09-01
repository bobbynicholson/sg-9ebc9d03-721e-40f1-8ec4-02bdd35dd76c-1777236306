-- Keep the order payment projection derived from money.
--
-- A number of older paths stamped deposit_paid or payment_status directly,
-- so a customer who paid the whole order could still see "Deposit Paid".
-- This migration provides one database-side reconciliation function and
-- triggers it for payment changes and order-total changes. It also repairs
-- existing orders once, using the completed payments ledger where present
-- and the legacy order money fields only when no ledger row exists.

CREATE OR REPLACE FUNCTION public.reconcile_order_payment_totals(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_paid numeric := 0;
  v_has_ledger boolean := false;
  v_balance numeric := 0;
  v_status text;
  v_deposit_paid boolean;
BEGIN
  SELECT id, total_amount, amount_paid, deposit_amount, deposit_paid,
         balance_amount, balance_paid, payment_status::text AS payment_status
    INTO v_order
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

  -- Some early orders have money columns but no payment row. Preserve that
  -- information only for those legacy rows; once a ledger exists it is the
  -- source of truth.
  IF NOT v_has_ledger THEN
    v_paid := GREATEST(
      0,
      COALESCE(v_order.amount_paid, 0),
      CASE
        WHEN COALESCE(v_order.deposit_paid, false)
          THEN COALESCE(v_order.deposit_amount, 0)
        ELSE 0
      END,
      CASE
        WHEN COALESCE(v_order.balance_paid, false)
          THEN COALESCE(v_order.balance_amount, 0)
        ELSE 0
      END,
      CASE
        WHEN v_order.payment_status = 'paid'
          THEN COALESCE(v_order.total_amount, 0)
        ELSE 0
      END
    );
  END IF;

  v_paid := round(GREATEST(v_paid, 0), 2);
  v_balance := round(GREATEST(COALESCE(v_order.total_amount, 0) - v_paid, 0), 2);

  IF COALESCE(v_order.payment_status, '') IN ('refunded', 'partially_refunded') THEN
    -- Refund workflows own these terminal/intermediate labels. Still repair
    -- amount_paid and balance_amount so the money figures remain accurate.
    v_status := v_order.payment_status;
  ELSIF COALESCE(v_order.total_amount, 0) > 0
    AND round(v_paid * 100) >= round(COALESCE(v_order.total_amount, 0) * 100) THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'pending';
  END IF;

  v_deposit_paid := CASE
    WHEN COALESCE(v_order.deposit_amount, 0) > 0
      THEN round(v_paid * 100) >= round(v_order.deposit_amount * 100)
    ELSE v_paid > 0
  END;

  UPDATE public.orders
     SET amount_paid = v_paid,
         balance_amount = v_balance,
         balance_paid = (COALESCE(v_order.total_amount, 0) > 0 AND v_balance <= 0.01),
         deposit_paid = v_deposit_paid,
         payment_status = v_status::public.payment_status,
         updated_at = now()
   WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_order_payment_totals_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  -- Reconcile both sides on UPDATE because a payment can be linked to an
  -- invoice/order after insertion (the gateway webhook does this).
  FOR v_order_id IN
    SELECT DISTINCT x.order_id
      FROM (
        SELECT NEW.order_id AS order_id
        WHERE TG_OP IN ('INSERT', 'UPDATE') AND NEW.order_id IS NOT NULL
        UNION ALL
        SELECT OLD.order_id
        WHERE TG_OP IN ('UPDATE', 'DELETE') AND OLD.order_id IS NOT NULL
        UNION ALL
        SELECT i.order_id
          FROM public.invoices i
         WHERE TG_OP IN ('INSERT', 'UPDATE')
           AND NEW.invoice_id IS NOT NULL
           AND i.id = NEW.invoice_id
           AND i.order_id IS NOT NULL
        UNION ALL
        SELECT i.order_id
          FROM public.invoices i
         WHERE TG_OP IN ('UPDATE', 'DELETE')
           AND OLD.invoice_id IS NOT NULL
           AND i.id = OLD.invoice_id
           AND i.order_id IS NOT NULL
      ) x
     WHERE x.order_id IS NOT NULL
  LOOP
    PERFORM public.reconcile_order_payment_totals(v_order_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_order_payment_totals ON public.payments;
CREATE TRIGGER trg_reconcile_order_payment_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.reconcile_order_payment_totals_on_payment();

CREATE OR REPLACE FUNCTION public.reconcile_order_payment_totals_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reconcile_order_payment_totals(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_order_payment_totals_on_order ON public.orders;
CREATE TRIGGER trg_reconcile_order_payment_totals_on_order
  AFTER UPDATE OF total_amount ON public.orders
  FOR EACH ROW
  WHEN (OLD.total_amount IS DISTINCT FROM NEW.total_amount)
  EXECUTE FUNCTION public.reconcile_order_payment_totals_on_order_change();

-- Repair every existing non-deleted order immediately on migration. The
-- function is deliberately called row-by-row so its source-of-truth rules
-- are identical for the backfill and for all future payment events.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE deleted_at IS NULL LOOP
    PERFORM public.reconcile_order_payment_totals(r.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_order_payment_totals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_order_payment_totals(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
