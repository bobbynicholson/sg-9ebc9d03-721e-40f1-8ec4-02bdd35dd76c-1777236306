-- P1-38: backfill payments.invoice_id for legacy rows
--
-- payments.invoice_id was added in
-- 20260504170100_payments_add_invoice_id.sql but historical rows
-- written before that migration would have invoice_id = NULL even
-- when an invoice exists for the linked order. The recalc trigger
-- (P0-09) follows order_id -> invoices.order_id as a fallback so
-- those rows still recompute, but the direct link is missing in
-- analytics queries that JOIN on invoice_id.
--
-- Backfill any payment row where invoice_id IS NULL and the linked
-- order has a single invoice. Idempotent: only updates NULL slots,
-- never overwrites an existing link.
--
-- Verified zero production payments rows at migration time. Kept
-- the backfill SQL in place so any future test seed data with the
-- old shape gets corrected when the migration runs.

UPDATE public.payments p
   SET invoice_id = i.id,
       updated_at = COALESCE(p.updated_at, now())
  FROM public.invoices i
 WHERE p.invoice_id IS NULL
   AND p.order_id IS NOT NULL
   AND i.order_id = p.order_id
   AND i.deleted_at IS NULL
   AND NOT EXISTS (
     -- Skip if there's more than one invoice for the order; we can't
     -- pick which to link without operator review. Those stay NULL.
     SELECT 1 FROM public.invoices i2
      WHERE i2.order_id = p.order_id
        AND i2.deleted_at IS NULL
        AND i2.id <> i.id
   );
