-- Per-order receipts + scan outcome on purchase_receipts.
--
-- Two gaps this closes:
--   1. A scanned supplier slip could not be tied to the catering order it
--      was bought for, so the order doc had no way to show "here are the
--      receipts for this event" to an admin.
--   2. The scan outcome (did the AI read it cleanly, partially, or was it
--      keyed in by hand) lived only on the transient import_rows row, not
--      on the permanent receipt. We want it queryable + visible per receipt.
--
-- order_id is nullable: generic supplier slips that aren't for one specific
-- order (bulk stock buys) simply leave it null and never surface on an order.
-- ON DELETE SET NULL so purging an order never orphans a real spend record.

alter table public.purchase_receipts
  add column if not exists order_id uuid
    references public.orders(id) on delete set null;

-- Scan outcome. Set when the slip is reconciled/saved:
--   ok      - AI extraction was complete (supplier + total + line items)
--   partial - AI extraction had gaps the operator had to fill
--   manual  - keyed in by hand (no AI scan, e.g. AI key missing in prod)
--   failed  - AI scan errored and could not be read
--   pending - stored but not yet scanned/reconciled
alter table public.purchase_receipts
  add column if not exists scan_status text
    check (scan_status is null or scan_status in ('ok','partial','manual','failed','pending'));

-- Compact snapshot of what the scan produced (supplier, total, date, ref,
-- line-item count, source filename, scanned_at). jsonb so the order doc can
-- render the outcome without re-reading import_rows.
alter table public.purchase_receipts
  add column if not exists scan_result jsonb;

create index if not exists idx_purchase_receipts_order
  on public.purchase_receipts(order_id) where order_id is not null;
