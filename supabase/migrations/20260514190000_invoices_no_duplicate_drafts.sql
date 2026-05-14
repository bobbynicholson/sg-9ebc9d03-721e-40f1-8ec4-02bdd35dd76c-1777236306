-- Wave 28.9: stop the same order from having two live invoices.
--
-- Bobby spotted /admin/invoices showing two DRAFT invoices for the
-- same Bobby Nicholson order with different totals -- side effect of
-- the price being adjusted on the order. The schema only constrained
-- (company_id, invoice_number); nothing prevented multiple live
-- invoices per order_id, so a buggy code path / race could (and did)
-- insert a second draft instead of updating the first.
--
-- Two-part fix:
--   1. Backfill -- void every older duplicate draft per order so
--      the existing corruption clears. Keeps the newest live invoice
--      as the survivor (its total reflects the latest order price).
--   2. Partial unique index on (order_id) where the row is live and
--      pre-payment. Belt-and-braces against future regressions even
--      if the application layer slips up.
--
-- The matching application-layer fix lives in
-- src/services/invoiceGenerationService.ts where ensureInvoiceForOrder
-- + recalcInvoiceForOrder now tolerate-and-heal duplicates rather
-- than crashing on .maybeSingle() when more than one row exists.

BEGIN;

-- 1. BACKFILL ----------------------------------------------------------
--
-- For every order that has more than one live (deleted_at IS NULL,
-- non-paid) invoice, mark all but the newest as cancelled +
-- soft-deleted. This is what ensureInvoiceForOrder will now do at
-- runtime; we apply it once historically so the table is clean
-- before the unique index goes on.
WITH ranked AS (
  SELECT
    id,
    order_id,
    company_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY order_id, company_id
      ORDER BY created_at DESC
    ) AS rn
  FROM public.invoices
  WHERE deleted_at IS NULL
    AND status IN ('draft', 'sent', 'overdue', 'partially_paid')
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE public.invoices
SET
  status        = 'written_off',
  balance_due   = 0,
  deleted_at    = NOW(),
  updated_at    = NOW()
WHERE id IN (SELECT id FROM duplicates);

-- 2. PARTIAL UNIQUE INDEX ---------------------------------------------
--
-- Only enforce uniqueness on live, pre-payment invoices so the
-- legitimate "deposit invoice was paid, balance invoice is now
-- created" pattern still works (paid invoices are excluded from
-- the index).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_one_live_per_order
  ON public.invoices (order_id)
  WHERE deleted_at IS NULL
    AND status IN ('draft', 'sent', 'overdue', 'partially_paid');

COMMIT;
