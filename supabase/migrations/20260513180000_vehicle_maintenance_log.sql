-- Phase 6 #3: vehicle maintenance log + service-due fields. Mirrors
-- the equipment_maintenance_log shape from Phase 4 #6.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS last_serviced_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS next_service_due DATE NULL,
  ADD COLUMN IF NOT EXISTS service_interval_days INTEGER NULL,
  ADD COLUMN IF NOT EXISTS current_odometer_km INTEGER NULL;

COMMENT ON COLUMN public.vehicles.last_serviced_at IS 'Phase 6 #3.';
COMMENT ON COLUMN public.vehicles.next_service_due IS 'Phase 6 #3.';
COMMENT ON COLUMN public.vehicles.service_interval_days IS 'Phase 6 #3.';
COMMENT ON COLUMN public.vehicles.current_odometer_km IS 'Phase 6 #3.';

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  serviced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  serviced_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL DEFAULT 'service',
  notes TEXT NULL,
  cost NUMERIC NULL,
  odometer_km INTEGER NULL,
  next_service_due DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_log_vehicle
  ON public.vehicle_maintenance_log (vehicle_id, serviced_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_log_company
  ON public.vehicle_maintenance_log (company_id, serviced_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_next_service_due
  ON public.vehicles (company_id, next_service_due)
  WHERE next_service_due IS NOT NULL;

ALTER TABLE public.vehicle_maintenance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicle_maintenance_log_select_same_company
  ON public.vehicle_maintenance_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.company_id = vehicle_maintenance_log.company_id
    )
  );

CREATE POLICY vehicle_maintenance_log_insert_same_company
  ON public.vehicle_maintenance_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.company_id = vehicle_maintenance_log.company_id
    )
  );

CREATE OR REPLACE FUNCTION public.vehicle_maintenance_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vehicles
     SET last_serviced_at = NEW.serviced_at,
         next_service_due = COALESCE(
           NEW.next_service_due,
           CASE WHEN vehicles.service_interval_days IS NOT NULL
             THEN (NEW.serviced_at + (vehicles.service_interval_days || ' days')::interval)::date
             ELSE vehicles.next_service_due
           END
         ),
         current_odometer_km = COALESCE(NEW.odometer_km, vehicles.current_odometer_km),
         updated_at = now()
   WHERE id = NEW.vehicle_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_maintenance_rollup ON public.vehicle_maintenance_log;
CREATE TRIGGER trg_vehicle_maintenance_rollup
  AFTER INSERT ON public.vehicle_maintenance_log
  FOR EACH ROW
  EXECUTE FUNCTION public.vehicle_maintenance_rollup();
