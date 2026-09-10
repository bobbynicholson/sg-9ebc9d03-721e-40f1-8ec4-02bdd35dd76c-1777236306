-- Kitchen portal audit (2026-07-05) - fix two classes of defect found
-- across the Live-now / Kitchen-ops pages.
--
-- 1. CLOCK-IN / CLOCK-OUT ROSTER STAMP SILENTLY FAILS FOR kitchen_staff.
--    /team-portal/kitchen/duty stamps kitchen_shifts.actual_start /
--    actual_end / status when a chef clocks in/out (duty.tsx:630-643,
--    698-712). But the only UPDATE policy on kitchen_shifts
--    (kitchen_shifts_admin_update, 20260626120000) permits just
--    super_admin / company_admin / owner / admin / kitchen_manager. A
--    plain kitchen_staff chef therefore produces a 0-row update with NO
--    error (RLS USING excludes the row; PostgREST returns success), so:
--      - actual_start / actual_end are never set
--      - status stays 'scheduled'
--      - the roster-coverage chip shows "0 of N clocked in"
--      - the missed-shift check can later mark a worked shift 'missed'
--    Fix: a SELF-service UPDATE policy so a staffer can stamp their OWN
--    roster row (staff_id = auth.uid()). Permissive, so it OR-combines
--    with the existing admin policy - managers keep full access.
--
-- 2. DEAD REALTIME SUBSCRIPTIONS. Several kitchen pages subscribe via
--    postgres_changes to tables that were never added to the
--    supabase_realtime publication, so Postgres never streams their
--    changes and the handlers silently never fire:
--      - cleaning_event_checklists  (today/dashboard cleaning chip)
--      - order_chat_messages        (today/dashboard inbound chat)
--      - kitchen_handoffs           (duty hand-off notes / acknowledge)
--      - order_items                (prep-list ingredient pull)
--      - menu_items                 (recipes library live edits)
--    Add each to the publication with REPLICA IDENTITY FULL so the
--    client-side company_id filters + RLS survive UPDATE / DELETE events.
--
-- Idempotent + safe to run repeatedly.

-- ── 1. Self-service clock stamp on kitchen_shifts ─────────────────────
DROP POLICY IF EXISTS kitchen_shifts_self_clock_update ON public.kitchen_shifts;
CREATE POLICY kitchen_shifts_self_clock_update
  ON public.kitchen_shifts FOR UPDATE
  USING (
    staff_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  )
  WITH CHECK (
    staff_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

-- ── 2. Publish the dead-subscription tables for realtime ──────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cleaning_event_checklists',
    'order_chat_messages',
    'kitchen_handoffs',
    'order_items',
    'menu_items'
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
