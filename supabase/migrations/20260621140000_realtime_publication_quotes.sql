-- Make quote changes real-time too.
--
-- Companion to 20260621130000_realtime_publication_order_flow.sql. The
-- admin quote page (admin/quotes/[id].tsx) and the public quote view
-- (q/[token].tsx) now subscribe to quote + quote_change_request changes so
-- a re-priced quote and new client change requests appear live without a
-- reload. Like the order-flow tables, these were never members of the
-- `supabase_realtime` publication, so Postgres never streamed them.
--
-- This migration:
--   1. Adds quotes + quote_change_requests to the supabase_realtime
--      publication (idempotent - skips tables already published).
--   2. Sets REPLICA IDENTITY FULL so the client-side filters
--      (company_id / quote_id / public_token) and RLS evaluate on
--      UPDATE/DELETE events, not just INSERT.
--
-- Safe to run repeatedly.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'quotes',
    'quote_change_requests'
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
