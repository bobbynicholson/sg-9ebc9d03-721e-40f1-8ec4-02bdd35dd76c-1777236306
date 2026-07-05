-- Fix: overdue sweep must include partially-paid invoices.
--
-- update_overdue_invoices() only flipped invoices at status='sent' to
-- 'overdue'. But the common non-payment case is: client pays the DEPOSIT
-- (invoice -> 'partially_paid'), then lets the BALANCE go past its
-- due_date. Those invoices never flipped to 'overdue', so:
--   * /admin/invoices?status=overdue missed them,
--   * the InvoiceAgingCard / aging dashboard undercounted,
--   * update-overdue-invoices cron's admin digest never fired for them.
--
-- The invoice status machine (services/order/invoiceStatus.ts) already
-- allows partially_paid -> overdue, so this is purely widening the sweep.
-- 'paid' is excluded (balance settled); 'draft'/'voided'/'written_off'
-- are intentionally left out.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION update_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.invoices SET status = 'overdue'
  WHERE due_date < CURRENT_DATE
    AND status IN ('sent', 'partially_paid')
    AND deleted_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
