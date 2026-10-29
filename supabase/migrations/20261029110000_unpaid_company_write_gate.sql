-- Unpaid companies cannot change their business data.
--
-- The middleware already sends staff of a lapsed company (expired trial ->
-- 'suspended' by cron/expire-trials, or 'cancelled') to the subscription
-- page, but that only guards page navigation: an open tab or a direct
-- database call could still create and change quotes, orders, invoices...
-- These RESTRICTIVE policies close that at the database for signed-in users.
--
-- Same rule as the middleware (src/lib/subscriptionAccess.ts):
--   allowed  : status active / past_due, trial not yet ended, unknown status
--   blocked  : suspended, cancelled, trial past trial_ends_at
--   exempt   : super admins, clients (a caterer's billing must not lock out
--              their customers), and server-side code (service role
--              bypasses RLS; auth.uid() is null for it anyway).
-- Reads are not affected. Additive: a new function + new policies only.

BEGIN;

CREATE OR REPLACE FUNCTION public.company_write_allowed(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_company_id IS NULL
    OR auth.uid() IS NULL
    OR public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'client')
    OR NOT EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = p_company_id
        AND (
          c.subscription_status::text IN ('suspended', 'cancelled')
          OR (c.subscription_status::text = 'trial' AND c.trial_ends_at IS NOT NULL AND c.trial_ends_at <= now())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.company_write_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_write_allowed(uuid) TO authenticated, service_role;

DO $$
DECLARE
  t text;
  gated text[] := ARRAY[
    'quotes', 'orders', 'invoices', 'clients', 'leads', 'payments',
    'menu_items', 'booking_packages',
    'equipment', 'equipment_bookings', 'equipment_hire_orders', 'equipment_damages',
    'inventory_items', 'inventory_batches', 'inventory_transactions',
    'suppliers', 'purchase_receipts', 'shopping_lists',
    'driver_assignments', 'delivery_routes', 'vehicles',
    'kitchen_prep_tasks', 'kitchen_duty_shifts', 'kitchen_staff_shifts', 'kitchen_stations', 'kitchen_handoffs',
    'cleaning_duty_logs', 'cleaning_schedules',
    'recipes', 'outsource_providers', 'staff_invitations',
    'cancellation_requests', 'order_amendment_requests'
  ];
BEGIN
  FOREACH t IN ARRAY gated LOOP
    -- Skip tables that do not exist (or have no company_id) on this database.
    IF to_regclass('public.' || t) IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) THEN
      RAISE NOTICE 'subscription gate: skipped %', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS subscription_gate_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS subscription_gate_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS subscription_gate_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY subscription_gate_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (public.company_write_allowed(company_id))', t);
    EXECUTE format(
      'CREATE POLICY subscription_gate_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (public.company_write_allowed(company_id)) WITH CHECK (public.company_write_allowed(company_id))', t);
    EXECUTE format(
      'CREATE POLICY subscription_gate_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (public.company_write_allowed(company_id))', t);
  END LOOP;
END $$;

COMMIT;
