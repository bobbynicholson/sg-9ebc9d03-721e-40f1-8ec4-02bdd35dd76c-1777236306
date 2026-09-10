-- Wave 49 B2 -- driver_confirmations was a phantom table.
--
-- driverConfirmationService has been writing to public.driver_confirmations
-- since Wave 11, but the table never existed in the live database. Every
-- en-route / arrived / departed tap from the (orphaned) DriverConfirmationPanel
-- failed with PGRST relation-not-found and got swallowed by the
-- catch-and-toast in the panel. Wave 48 mounted the panel onto the
-- driver deliveries page; without this table, every tap will fail.

CREATE TABLE IF NOT EXISTS public.driver_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  confirmation_type TEXT NOT NULL CHECK (confirmation_type IN (
    'en_route_to_kitchen',
    'at_kitchen',
    'departed_kitchen',
    'at_venue',
    'setup_started',
    'service_started',
    'departed_venue',
    'completed'
  )),
  location_lat NUMERIC,
  location_lng NUMERIC,
  notes TEXT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_confirmations_order_type
  ON public.driver_confirmations (order_id, confirmation_type, confirmed_at);

CREATE INDEX IF NOT EXISTS idx_driver_confirmations_driver
  ON public.driver_confirmations (driver_id, confirmed_at);

ALTER TABLE public.driver_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drivers_own_confirmations_select" ON public.driver_confirmations;
CREATE POLICY "drivers_own_confirmations_select"
  ON public.driver_confirmations FOR SELECT
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "drivers_own_confirmations_insert" ON public.driver_confirmations;
CREATE POLICY "drivers_own_confirmations_insert"
  ON public.driver_confirmations FOR INSERT
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "tenant_admin_select_confirmations" ON public.driver_confirmations;
CREATE POLICY "tenant_admin_select_confirmations"
  ON public.driver_confirmations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.profiles p ON p.company_id = o.company_id
      WHERE o.id = order_id
        AND p.id = auth.uid()
        AND p.role IN ('company_admin', 'admin', 'super_admin')
    )
  );

COMMENT ON TABLE public.driver_confirmations IS
  'Wave 49 B2 -- audit trail of driver tap-confirmations through the event-day chain. Canonical state lives on orders + driver_assignments; this table is the per-tap event log + GPS capture for dispute resolution.';
