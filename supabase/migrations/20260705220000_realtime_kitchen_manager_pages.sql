-- Make the kitchen MANAGER pages truly real-time.
--
-- Audit (2026-07-05) of the three kitchen-manager nav pages found their
-- realtime subscriptions were mostly dead: the pages `.on()`-subscribe to
-- a set of tables and debounce-refetch on any change, but most of those
-- tables were never members of the `supabase_realtime` publication, so
-- Postgres never streamed their changes and the handlers silently never
-- fired. Symptoms: a staffer clocks in, a stock level drops, a damage is
-- logged, a shift task is added on another device - and the open manager
-- board stays stale until an unrelated already-published table (orders /
-- kitchen_prep_tasks / kitchen_shifts) happens to change and forces a
-- full refetch.
--
-- Pages + their subscriptions:
--   /admin/teams/kitchen (Team overview):
--     profiles, user_departments, kitchen_duty_shifts, kitchen_staff_shifts,
--     kitchen_staff_members, inventory_items, inventory_batches,
--     equipment_damages, equipment_handovers
--     (orders + kitchen_prep_tasks already published in 20260621130000)
--   /admin/kitchen-schedule (Schedule):
--     staff_shift_tasks, profiles
--     (orders + kitchen_shifts already published in 20260621130000)
--
-- This migration adds the missing tables to the publication and sets
-- REPLICA IDENTITY FULL on each so the client-side company_id filters and
-- RLS can be evaluated on UPDATE / DELETE events too (default replica
-- identity ships only the PK in the old row, so filtered UPDATE/DELETE
-- events would silently drop).
--
-- Idempotent - skips tables already published and tables that don't exist.
-- Safe to run repeatedly.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles',
    'user_departments',
    'kitchen_duty_shifts',
    'kitchen_staff_shifts',
    'kitchen_staff_members',
    'inventory_items',
    'inventory_batches',
    'equipment_damages',
    'equipment_handovers',
    'staff_shift_tasks'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;

      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;
