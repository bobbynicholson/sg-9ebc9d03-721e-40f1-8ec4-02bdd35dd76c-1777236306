-- Auto-generate a draft invoice when an order is marked completed.
--
-- Why: the client portal expects a Billing tab populated after each
-- event, but invoice creation has been admin-side and manual. Caterers
-- forget to issue invoices, the portal stays empty, and the deposit /
-- balance flow has no system trail. This trigger creates a draft row
-- the admin can review + send (status='draft' on purpose -- we don't
-- auto-publish, the admin still controls when the client sees it).
--
-- Fires only on the status transition into completed, NOT on every
-- update of a completed order. Idempotent: skips creation if an
-- invoice already exists for this order_id.
--
-- The invoice mirrors the order totals 1:1 and uses INV-{order_number}
-- as the invoice number so it's traceable back to the source order
-- and unique-per-tenant by construction.

CREATE OR REPLACE FUNCTION public.auto_create_invoice_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_invoice_id UUID;
  computed_invoice_number TEXT;
BEGIN
  -- Only act on the status transition into completed.
  IF NEW.status <> 'completed' OR (OLD.status IS NOT NULL AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  -- Skip if an invoice already exists for this order (admin may have
  -- issued one manually before completion, or this trigger may have
  -- fired on a prior completion that was reverted then re-applied).
  SELECT id INTO existing_invoice_id
  FROM public.invoices
  WHERE order_id = NEW.id
    AND deleted_at IS NULL
  LIMIT 1;

  IF existing_invoice_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  computed_invoice_number := 'INV-' || NEW.order_number;

  INSERT INTO public.invoices (
    company_id,
    invoice_number,
    client_id,
    order_id,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total_amount,
    amount_paid,
    balance_due,
    status,
    notes
  ) VALUES (
    NEW.company_id,
    computed_invoice_number,
    NEW.client_id,
    NEW.id,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '14 days',
    COALESCE(NEW.subtotal, 0),
    COALESCE(NEW.tax_amount, 0),
    COALESCE(NEW.total_amount, 0),
    COALESCE(NEW.amount_paid, 0),
    GREATEST(COALESCE(NEW.total_amount, 0) - COALESCE(NEW.amount_paid, 0), 0),
    'draft',
    'Auto-created on order completion. Review and send.'
  )
  ON CONFLICT (company_id, invoice_number) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_invoice_on_order_completion ON public.orders;
CREATE TRIGGER trg_auto_invoice_on_order_completion
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_invoice_on_completion();

-- Backfill: any order already in 'completed' state without a matching
-- invoice gets one. One-shot at migration time so the existing fleet
-- doesn't keep its empty Billing tab.
INSERT INTO public.invoices (
  company_id,
  invoice_number,
  client_id,
  order_id,
  invoice_date,
  due_date,
  subtotal,
  tax_amount,
  total_amount,
  amount_paid,
  balance_due,
  status,
  notes
)
SELECT
  o.company_id,
  'INV-' || o.order_number,
  o.client_id,
  o.id,
  COALESCE(o.completed_at::date, CURRENT_DATE),
  COALESCE(o.completed_at::date, CURRENT_DATE) + INTERVAL '14 days',
  COALESCE(o.subtotal, 0),
  COALESCE(o.tax_amount, 0),
  COALESCE(o.total_amount, 0),
  COALESCE(o.amount_paid, 0),
  GREATEST(COALESCE(o.total_amount, 0) - COALESCE(o.amount_paid, 0), 0),
  'draft',
  'Backfilled on auto-invoice trigger rollout.'
FROM public.orders o
WHERE o.status = 'completed'
  AND o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.order_id = o.id AND i.deleted_at IS NULL
  )
ON CONFLICT (company_id, invoice_number) DO NOTHING;
