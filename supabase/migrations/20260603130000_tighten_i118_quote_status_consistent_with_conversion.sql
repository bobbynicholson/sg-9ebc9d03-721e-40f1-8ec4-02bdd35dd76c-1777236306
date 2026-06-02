-- TIGHTEN I.118 (2026-06-02): keep quotes.status consistent with the
-- conversion lifecycle.
--
-- /admin/quotes/new's "Save draft" button writes status='draft' via a
-- direct supabase UPDATE, bypassing quoteService.updateQuote's
-- state-machine guard. When an operator clicks it on a quote that's
-- already accepted + converted to a live order, the row ends up in
-- an impossible state:
--   * status = 'draft'
--   * accepted_at IS NOT NULL
--   * converted_to_order_id IS NOT NULL (and the order is confirmed)
-- The /admin/quotes index card then renders "draft" + "Sent today" +
-- "Not sent yet" + "Won + booked" as a confused mash. Caught on
-- QT-20260503-7N868C - order ORD-003832 was live + confirmed while
-- the quote silently said draft.
--
-- Forward fix: a CHECK constraint that rejects status='draft' once
-- converted_to_order_id is set. The legitimate "I want to keep
-- editing privately" flow uses the Duplicate-as-draft action which
-- produces a fresh draft row, leaving the original quote + order
-- intact.
--
-- Data fix: patch the one currently bad row (QT-20260503-7N868C) back
-- to status='accepted' so the constraint applies cleanly. The other
-- two pre-existing rows in odd states (KZBHFY=sent+cancelled-order,
-- QUO-000013=rejected+cancelled-order) are coherent enough not to
-- touch.

-- 1. Heal the live broken row.
update public.quotes
set status = 'accepted'
where quote_number = 'QT-20260503-7N868C'
  and status = 'draft'
  and converted_to_order_id is not null
  and accepted_at is not null;

-- 2. Forward-prevention constraint. NOT VALID + VALIDATE so existing
--    odd rows (status='sent'/'rejected' with cancelled converted
--    orders) don't trip the migration; they're not 'draft' so the
--    constraint passes regardless.
alter table public.quotes
  drop constraint if exists quotes_draft_implies_no_conversion;

alter table public.quotes
  add constraint quotes_draft_implies_no_conversion
  check (status <> 'draft' or converted_to_order_id is null)
  not valid;

alter table public.quotes
  validate constraint quotes_draft_implies_no_conversion;

comment on constraint quotes_draft_implies_no_conversion on public.quotes is
  'A quote that has been converted to an order can never be status=draft. '
  'See TIGHTEN I.118 (2026-06-02) - /admin/quotes/new Save draft used to '
  'silently downgrade converted quotes to draft, producing impossible state.';
