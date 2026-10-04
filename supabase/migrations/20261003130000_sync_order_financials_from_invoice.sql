-- Keep order payment fields aligned for every invoice payment source:
-- PayFast, Yoco, Stripe, verified EFT, and admin-recorded payments.
-- Invoice amounts/status remain the payment ledger source of truth.
CREATE OR REPLACE FUNCTION public.sync_order_payment_projection_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_total numeric := 0;
  v_invoice_paid numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_deposit_amount numeric := 0;
  v_deposit_percent numeric := 0;
  v_company_deposit_percent numeric := 0;
  v_event_date date;
  v_deposit_target numeric := 0;
  v_deposit_met boolean := false;
  v_fully_paid boolean := false;
  v_old_deposit_paid_at timestamptz;
  v_old_balance_paid_at timestamptz;
  v_now timestamptz := now();
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT company_id, total_amount, deposit_amount, deposit_percentage,
         event_date, deposit_paid_at, balance_paid_at
    INTO v_company_id, v_total, v_deposit_amount, v_deposit_percent,
         v_event_date, v_old_deposit_paid_at, v_old_balance_paid_at
    FROM public.orders
   WHERE id = NEW.order_id
   FOR UPDATE;

  IF NOT FOUND OR v_company_id IS DISTINCT FROM NEW.company_id THEN
    RETURN NEW;
  END IF;

  SELECT deposit_percent
    INTO v_company_deposit_percent
    FROM public.companies
   WHERE id = v_company_id;

  v_total := GREATEST(COALESCE(v_total, NEW.total_amount, 0), 0);
  v_invoice_paid := GREATEST(COALESCE(NEW.amount_paid, 0), 0);
  v_paid := LEAST(v_total, v_invoice_paid);
  v_balance := GREATEST(0, round(v_total - v_paid, 2));
  v_fully_paid := v_balance <= 0.01;

  IF v_event_date IS NOT NULL AND v_event_date <= CURRENT_DATE THEN
    v_deposit_target := v_total;
  ELSIF COALESCE(v_deposit_amount, 0) > 0 THEN
    v_deposit_target := LEAST(v_total, v_deposit_amount);
  ELSE
    IF COALESCE(v_deposit_percent, 0) <= 0 OR v_deposit_percent >= 100 THEN
      v_deposit_percent := v_company_deposit_percent;
    END IF;
    IF COALESCE(v_deposit_percent, 0) <= 0 OR v_deposit_percent >= 100 THEN
      v_deposit_percent := 50;
    END IF;
    v_deposit_target := round(v_total * v_deposit_percent / 100, 2);
  END IF;

  v_deposit_met := v_deposit_target > 0
    AND round(v_paid * 100) >= round(v_deposit_target * 100);

  UPDATE public.orders
     SET amount_paid = v_paid,
         balance_amount = v_balance,
         payment_status = CASE
           WHEN v_fully_paid THEN 'paid'::public.payment_status
           WHEN v_paid > 0 THEN 'partial'::public.payment_status
           ELSE 'pending'::public.payment_status
         END,
         deposit_paid = v_deposit_met,
         deposit_paid_at = CASE
           WHEN v_deposit_met THEN COALESCE(v_old_deposit_paid_at, v_now)
           ELSE NULL
         END,
         balance_paid = v_fully_paid,
         balance_paid_at = CASE
           WHEN v_fully_paid THEN COALESCE(v_old_balance_paid_at, v_now)
           ELSE NULL
         END,
         updated_at = v_now
   WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_sync_order_payment_projection ON public.invoices;
CREATE TRIGGER invoices_sync_order_payment_projection
AFTER INSERT OR UPDATE OF total_amount, amount_paid, balance_due, status
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_projection_from_invoice();

-- Repair existing live invoice/order pairs once so the order finance
-- panel starts from the same paid and outstanding figures as the invoice.
UPDATE public.invoices
   SET amount_paid = amount_paid
 WHERE order_id IS NOT NULL
   AND deleted_at IS NULL
   AND status IN ('draft', 'sent', 'overdue', 'partially_paid', 'paid');
