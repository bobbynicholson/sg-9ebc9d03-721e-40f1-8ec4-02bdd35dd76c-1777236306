-- TIGHTEN I.117 (2026-06-02): enable realtime publication on quotes
-- and orders so admin pages that already subscribe to postgres_changes
-- on these tables actually receive events.
--
-- /admin/quotes index and several other pages subscribe to
-- postgres_changes on quotes / orders to refetch after edits land in
-- another tab or via Save & Send. The supabase_realtime publication
-- never included these tables, so every subscription was a silent
-- no-op. Symptom: edit a quote (guests 8 -> 26, date moves a day),
-- DB updates correctly, but the index card keeps showing pre-edit
-- values because nothing told React to refetch. Bobby caught this on
-- QT-20260503-7N868C - card showed "8 guests / 04 Jun" while the DB
-- already had 26 guests / 05 Jun.
--
-- Idempotent: ALTER PUBLICATION ADD TABLE errors if the table is
-- already a member, so we guard with pg_publication_tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'quotes'
  ) then
    execute 'alter publication supabase_realtime add table public.quotes';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
end $$;
