-- Publish tenant-owned tables used by the admin pages' realtime feeds.
-- Several pages already subscribed to these tables but the publication
-- omitted them, leaving their Refresh controls as the only way to see
-- changes made in another tab or device.
--
-- Idempotent and guarded for installations that do not have a legacy
-- table yet. Full replica identity is needed for company_id filters on
-- UPDATE/DELETE events; gps_tracking is INSERT-only and intentionally
-- keeps the smaller default replica identity.
DO $$
DECLARE
  v_table text;
  tenant_tables text[] := ARRAY[
    'clients',
    'staff_invitations',
    'email_templates',
    'whatsapp_templates',
    'outgoing_email_queue',
    'quote_followup_log',
    'vehicles',
    'vehicle_maintenance_log',
    'equipment',
    'inventory_transactions',
    'driver_shifts',
    'driver_payouts',
    'public_holidays',
    'regions',
    'leads',
    'cleaning_event_handovers',
    'cleaning_duty_logs',
    'outsource_assignments',
    'outsource_providers',
    'team_manager_notes',
    'order_assignment_audit'
  ];
BEGIN
  FOREACH v_table IN ARRAY tenant_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;

      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gps_tracking'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gps_tracking'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_tracking';
  END IF;
END $$;
