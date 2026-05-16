-- Wave 66.8 -- backfill orphaned invoices on cancelled orders.
--
-- Wave 28.9 wired cancelOrder() to auto-flip unpaid invoices to
-- 'written_off' + soft-delete when an order cancels. Anything
-- cancelled before that ship (seed/demo data, manual DB flips that
-- bypassed the workflow) left invoices stuck in 'sent' / 'overdue' /
-- 'draft' / 'partially_paid' against a cancelled order. INV-005531
-- on ORD-F3FE3826 (seed leftover) is the canary -- showed as
-- "Awaiting payment R2415" on the live chase view despite the order
-- being cancelled weeks ago.
--
-- One-shot retroactive fix matching the live cascade behaviour:
-- status -> written_off, balance_due -> 0, deleted_at stamped so the
-- row drops off active queries entirely. notes line written so the
-- bookkeeper sees why if they ever pull the row up via the
-- written_off filter.

UPDATE public.invoices i
SET
  status = 'written_off',
  balance_due = 0,
  deleted_at = NOW(),
  updated_at = NOW(),
  notes = COALESCE(NULLIF(i.notes, ''), '') ||
    CASE WHEN COALESCE(NULLIF(i.notes, ''), '') = '' THEN '' ELSE E'\n' END
    || 'Wave 66.8 backfill: voided automatically because the linked order is cancelled.'
FROM public.orders o
WHERE i.order_id = o.id
  AND o.status = 'cancelled'
  AND i.deleted_at IS NULL
  AND i.status IN ('draft', 'sent', 'overdue', 'partially_paid');
