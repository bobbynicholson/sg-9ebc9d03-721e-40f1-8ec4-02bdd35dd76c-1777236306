-- TIGHTEN I.109 (2026-06-02): backfill lost_reason='order_cancelled' on
-- every quote whose converted_to_order_id points at a cancelled order,
-- where lost_reason isn't already set to a more specific value.
--
-- Context: pre-I.62 (2026-06-01) the cancel cascade flipped quote.status
-- accepted -> rejected on linked-order cancel. I.62 stopped doing that
-- but the lost_reason marker was only stamped on quotes that were in
-- ('accepted', 'draft', 'sent') at cancel time. Quotes whose linked
-- order cancellation happened BEFORE I.62 shipped (or via paths that
-- bypass releaseResources) carry no lost_reason and read as "won"
-- on the dashboards.
--
-- Smoke walk on Spit Braai Delivery surfaced QT-20260504-KZBHFY: a
-- status='sent' quote whose linked order was cancelled 2026-05-15.
-- This backfill stamps the marker so the aggregators bucket it as
-- won_then_cancelled.
--
-- Safety: the WHERE clause only touches rows where lost_reason IS NULL
-- AND the linked order is currently cancelled. Idempotent - re-running
-- is a no-op once the row is stamped.

DO $$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE quotes q
  SET lost_reason = 'order_cancelled'
  WHERE q.converted_to_order_id IS NOT NULL
    AND q.lost_reason IS NULL
    AND EXISTS (
      SELECT 1
      FROM orders o
      WHERE o.id = q.converted_to_order_id
        AND (o.status = 'cancelled' OR o.cancelled_at IS NOT NULL)
    );

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE '[TIGHTEN I.109] Backfilled lost_reason=order_cancelled on % quote rows', rows_updated;
END $$;
