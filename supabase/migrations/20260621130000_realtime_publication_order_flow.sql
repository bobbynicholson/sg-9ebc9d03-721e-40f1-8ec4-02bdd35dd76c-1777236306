-- Make the order lifecycle truly real-time.
--
-- The admin orders list (admin/orders.tsx) and the order document
-- sections (OrderDocument + OrderTimelineSection and its child sections)
-- already subscribe via supabase realtime postgres_changes to the tables
-- that drive the timeline. But those subscriptions never fired on prod:
-- the tables were not members of the `supabase_realtime` publication, so
-- Postgres never streamed their changes. Proven by test: a status flip
-- did NOT update the open page live, but a manual reload showed the new
-- state - i.e. the data + recompute are correct, only the realtime
-- broadcast was missing.
--
-- This migration:
--   1. Adds every timeline-driving table to the supabase_realtime
--      publication (idempotent - skips tables already published).
--   2. Sets REPLICA IDENTITY FULL on each so the client-side filters
--      (company_id / order_id) and RLS can be evaluated on UPDATE and
--      DELETE events too (default replica identity only ships the PK in
--      the old row, so filtered UPDATE/DELETE events silently dropped).
--
-- Safe to run repeatedly.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders',
    'payments',
    'invoices',
    'driver_assignments',
    'kitchen_prep_tasks',
    'kitchen_shifts',
    'equipment_bookings',
    'equipment_hire_orders',
    'equipment_shortage_flags',
    'cleaning_jobs',
    'shopping_list_items',
    'event_attendance'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- Only add tables that actually exist (defensive on legacy schemas).
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      -- Add to the realtime publication if not already a member.
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;

      -- Full row image so filtered UPDATE/DELETE events carry the
      -- columns the subscriptions filter on (company_id / order_id).
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;
