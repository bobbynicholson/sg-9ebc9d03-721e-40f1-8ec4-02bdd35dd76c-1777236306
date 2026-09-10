-- P0-09: keep invoices.balance_due / amount_paid / status in sync with
-- the payments table and (when an order is amended) with the order's
-- total_amount.
--
-- Before: the auto_invoice trigger captured a one-shot snapshot at
-- creation time. After that snapshot:
--   - new payments updated orders.amount_paid but never invoices.amount_paid
--   - amendments to order.total_amount left the invoice frozen at the
--     old total
-- /admin/invoices and /pay/i/[token] surfaced stale numbers; the client
-- could see "balance R0" while the order showed "balance R3,400" or
-- vice versa.
--
-- This migration adds two triggers:
--   1. recalc_invoice_on_payment_change -- after INSERT/UPDATE/DELETE on
--      payments, recompute the linked invoice's amount_paid + balance_due
--      and (if fully paid) flip status to 'paid'.
--   2. recalc_invoice_on_order_amendment -- when orders.total_amount /
--      subtotal / tax_amount changes, mirror to the invoice (if any)
--      so long as the invoice is not yet 'paid'. Paid invoices freeze
--      to preserve history.

-- Helper: recompute a specific invoice's amount_paid + balance_due +
-- status from the sum of completed payments that touch it directly
-- (payments.invoice_id) OR via the order link (payments.order_id ->
-- invoices.order_id).
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_paid numeric;
  v_balance numeric;
  v_status text;
BEGIN
  SELECT id, order_id, total_amount, status
    INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Sum completed payments tied to this invoice directly OR through
  -- the order link. Direct ties win when both exist (deduped on payment
  -- id). Refunds reduce the paid total (but don't go negative).
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM (
      SELECT DISTINCT id, amount
        FROM public.payments
       WHERE payment_status = 'completed'
         AND (
           invoice_id = v_invoice.id
           OR (v_invoice.order_id IS NOT NULL AND order_id = v_invoice.order_id)
         )
    ) p;

  v_balance := GREATEST(COALESCE(v_invoice.total_amount, 0) - v_paid, 0);

  -- invoice_status enum: draft, sent, paid, partially_paid, overdue,
  -- written_off. written_off is terminal -- don't touch. Others get
  -- updated to reflect the current paid state.
  IF v_invoice.status::text = 'written_off' THEN
    v_status := 'written_off';
  ELSIF v_paid >= COALESCE(v_invoice.total_amount, 0) AND COALESCE(v_invoice.total_amount, 0) > 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partially_paid';
  ELSE
    -- Preserve draft / sent / overdue when nothing's paid. Don't
    -- demote sent->draft on a refund-to-zero, just leave the status
    -- alone.
    v_status := COALESCE(v_invoice.status::text, 'sent');
  END IF;

  UPDATE public.invoices
     SET amount_paid = v_paid,
         balance_due = v_balance,
         status = v_status::public.invoice_status,
         updated_at = now()
   WHERE id = v_invoice.id;
END;
$$;

-- Trigger function on payments: figure out which invoice(s) need recalc
-- and call the helper.
CREATE OR REPLACE FUNCTION public.recalc_invoice_on_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  -- Both NEW (insert/update) and OLD (delete/update) sides may point
  -- at different invoices, so handle both. Direct invoice_id link
  -- takes precedence, fall back to order_id -> invoices.order_id.

  -- Direct: payment.invoice_id
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.invoice_id IS NOT NULL THEN
    PERFORM public.recalc_invoice_totals(NEW.invoice_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.invoice_id IS NOT NULL THEN
    PERFORM public.recalc_invoice_totals(OLD.invoice_id);
  END IF;

  -- Indirect: payment.order_id -> invoices(order_id)
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.order_id IS NOT NULL THEN
    SELECT id INTO v_invoice_id
      FROM public.invoices
     WHERE order_id = NEW.order_id
       AND deleted_at IS NULL
     LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      PERFORM public.recalc_invoice_totals(v_invoice_id);
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.order_id IS NOT NULL THEN
    SELECT id INTO v_invoice_id
      FROM public.invoices
     WHERE order_id = OLD.order_id
       AND deleted_at IS NULL
     LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      PERFORM public.recalc_invoice_totals(v_invoice_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_invoice_on_payment_change ON public.payments;
CREATE TRIGGER trg_recalc_invoice_on_payment_change
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_invoice_on_payment_change();

-- Trigger function on orders: when total_amount / subtotal / tax_amount
-- change (e.g. amendment approval), mirror to the invoice so long as
-- it's not in a terminal state.
CREATE OR REPLACE FUNCTION public.recalc_invoice_on_order_amendment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_status text;
BEGIN
  IF NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.tax_amount IS NOT DISTINCT FROM OLD.tax_amount THEN
    RETURN NEW;
  END IF;

  SELECT id, status::text INTO v_invoice_id, v_invoice_status
    FROM public.invoices
   WHERE order_id = NEW.id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't mutate terminal / fully-paid invoices. Operator must issue a
  -- credit note or new invoice; we don't silently rewrite history.
  IF v_invoice_status IN ('paid', 'written_off') THEN
    RETURN NEW;
  END IF;

  UPDATE public.invoices
     SET subtotal = COALESCE(NEW.subtotal, 0),
         tax_amount = COALESCE(NEW.tax_amount, 0),
         total_amount = COALESCE(NEW.total_amount, 0),
         updated_at = now()
   WHERE id = v_invoice_id;

  -- Recompute balance_due against the new total.
  PERFORM public.recalc_invoice_totals(v_invoice_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_invoice_on_order_amendment ON public.orders;
CREATE TRIGGER trg_recalc_invoice_on_order_amendment
  AFTER UPDATE OF total_amount, subtotal, tax_amount ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_invoice_on_order_amendment();

REVOKE ALL ON FUNCTION public.recalc_invoice_totals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_invoice_totals(uuid) TO service_role;
