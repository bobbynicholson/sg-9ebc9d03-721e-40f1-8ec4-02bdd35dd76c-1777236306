-- Wave 70.51b -- track when an invoice was voided in Xero.
--
-- The local cancel cascade flips invoices.status='voided' (Wave 70.51a)
-- but the Xero side stayed live -- the catering company's Xero ledger
-- ended up with parallel invoice + credit-note rows that the
-- accountant had to reconcile manually.
--
-- This column records when the Xero-side VOID POST succeeded so:
--   - We never double-push (idempotency)
--   - Operators can see "this was voided in Xero on X" on the invoice page
--   - The cron-style retry from /api/accounting/xero/void-invoices can
--     skip already-voided rows
--
-- Xero's invoice VOID is restricted to unpaid invoices (AUTHORISED
-- status, no payments allocated). Partially-paid invoices still go
-- through the credit-note path (already implemented in
-- /api/accounting/xero/sync-credit-note from P1-24).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS xero_voided_at timestamptz;

COMMENT ON COLUMN public.invoices.xero_voided_at IS
  'Wave 70.51b -- when set, the original Xero invoice has been VOIDED via /api/accounting/xero/void-invoices. NULL means either (a) never tried, (b) attempt failed (last_sync_error has the message), or (c) invoice was paid so we used a credit-note instead.';

-- Partial index so the retry sweep / reporting can find unvoided
-- cancelled invoices cheaply.
CREATE INDEX IF NOT EXISTS idx_invoices_pending_xero_void
  ON public.invoices(company_id, status)
  WHERE status = 'voided' AND xero_voided_at IS NULL AND external_id IS NOT NULL;
