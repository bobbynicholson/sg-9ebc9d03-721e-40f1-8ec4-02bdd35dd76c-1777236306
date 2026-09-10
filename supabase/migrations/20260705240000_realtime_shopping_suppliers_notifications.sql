-- Shopping + waiter portal audit (2026-07-05): fix dead realtime.
--
-- Several shopping pages and the notifications inbox (waiter + shopping +
-- the app-wide notification bell) subscribe via postgres_changes to tables
-- that were never added to the supabase_realtime publication, so Postgres
-- never streams their changes and the handlers silently never fire:
--   - shopping_lists : Today desk, Active shop, Spend (list create/claim/
--                      complete never pushes live to another device)
--   - suppliers      : Suppliers page (admin-added supplier never appears
--                      live for the shopper)
--   - notifications  : waiter + shopping notification inboxes AND the
--                      global NotificationBell everywhere. This was only
--                      ever a manual Supabase dashboard step (see
--                      MASTER_SCHEMA_V2 checklist), so a restored/rebuilt
--                      DB can silently have NO live notifications at all.
--
-- Add each to the publication with REPLICA IDENTITY FULL so the client-side
-- company_id / recipient_id filters + RLS survive UPDATE / DELETE events.
-- (notifications realtime is INSERT-driven, but FULL is harmless and keeps
-- filtered updates - e.g. mark-read fan-in - working too.)
--
-- Idempotent + safe to run repeatedly.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'shopping_lists',
    'suppliers',
    'notifications'
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
