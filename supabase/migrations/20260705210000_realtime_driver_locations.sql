-- Real-time client live tracking: publish driver_locations.
--
-- The client tracking map (ClientTrackingMap) subscribes to
-- postgres_changes so the driver pin moves the instant the driver's GPS
-- pinger writes a new fix. The pinger UPSERTs the current position into
-- public.driver_locations (single row per driver, keyed on driver_id),
-- but that table was never a member of the `supabase_realtime`
-- publication, so no change event was ever delivered - the pin only
-- moved on the client's polling fallback.
--
-- gps_tracking (the append-only history log) is intentionally NOT added
-- here: it is not the current-state source, and a separate legacy insert
-- trigger currently rejects its rows (writes the dropped order_status
-- 'out_for_delivery'); that is tracked separately.
--
-- Idempotent: skips the ADD if driver_locations is already published.
-- REPLICA IDENTITY FULL so UPDATE payloads carry the full new row (the
-- client reads latitude/longitude/updated_at off payload.new and filters
-- on driver_id).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'driver_locations'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'driver_locations'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations';
    END IF;
    EXECUTE 'ALTER TABLE public.driver_locations REPLICA IDENTITY FULL';
  END IF;
END $$;
