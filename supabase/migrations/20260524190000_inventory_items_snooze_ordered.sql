-- SHOP-C (shopping deferred, 2026-05-24): two state extensions on
-- inventory_items to support the Buy-now flow Bobby's been asking
-- for.
--
-- 1. snooze_until - operator clicks "Snooze til Mon" when they
--    intentionally aren't reordering a perishable this week. The
--    inventory_demand_outlook view stays honest; the UI just hides
--    snoozed items from the Buy-now tab until the date passes.
--
-- 2. ordered_qty + ordered_at + ordered_until - "Mark as ordered"
--    intermediate state. Today the operator's only options on the
--    cart are ignore-the-row (it keeps re-flagging) or fake-receive
--    via Mark purchased (corrupts the stock ledger if the goods
--    aren't actually in hand). Now: Mark as ordered records that a
--    PO is in flight, suppresses the Buy-now flag for ordered_until
--    days, and waits for a real Mark purchased call to clear the
--    ordered state + write the inventory_transactions row.
--
-- Both columns nullable. Outlook view does NOT join them - the UI
-- layer reads them and filters/renders. Keeps the view simple and
-- avoids a heavier migration.

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS snooze_until date,
  ADD COLUMN IF NOT EXISTS ordered_qty numeric,
  ADD COLUMN IF NOT EXISTS ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS ordered_until date;

COMMENT ON COLUMN public.inventory_items.snooze_until IS
  'SHOP-C: operator-chosen date until which this item is hidden from /admin/shopping Buy-now. Set NULL or past to re-show. Does not affect the demand outlook view.';
COMMENT ON COLUMN public.inventory_items.ordered_qty IS
  'SHOP-C: quantity that has been ordered from a supplier but not yet physically received. The Buy-now tab subtracts this from the shortfall when deciding whether to flag the item.';
COMMENT ON COLUMN public.inventory_items.ordered_at IS
  'SHOP-C: timestamp the operator clicked Mark as ordered. Drives the "ordered Xd ago" pill on the row.';
COMMENT ON COLUMN public.inventory_items.ordered_until IS
  'SHOP-C: optional ETA - the row stops being flagged until this date. Falls back to "next 7 days" if null. Cleared when Mark purchased writes the receive transaction.';

-- Partial index for the cheap "is this item currently snoozed or
-- ordered" lookup the Buy-now filter runs on every row.
CREATE INDEX IF NOT EXISTS idx_inventory_items_snooze
  ON public.inventory_items (company_id, snooze_until)
  WHERE snooze_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_ordered
  ON public.inventory_items (company_id, ordered_until)
  WHERE ordered_qty IS NOT NULL AND ordered_qty > 0;
