-- Quote collaboration polish: stream internal note threads and support
-- explicit notification types for quote edits and team-only notes.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'quote_updated';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'quote_internal_note';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'audit_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
    END IF;
    ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
  END IF;
END $$;
