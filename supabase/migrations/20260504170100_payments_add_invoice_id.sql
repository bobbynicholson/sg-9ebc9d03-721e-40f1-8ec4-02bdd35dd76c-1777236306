-- Payments need a direct FK to invoices so the EFT-claim flow can
-- attach a pending payment to a specific invoice without going via
-- order_id (some invoices are stand-alone and have no order). Indexes
-- support the admin "show me pending EFT claims for this invoice"
-- query and the notification fanout query.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS invoice_id UUID
    REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_pending_eft
  ON public.payments(invoice_id)
  WHERE payment_method = 'eft' AND payment_status = 'pending';
