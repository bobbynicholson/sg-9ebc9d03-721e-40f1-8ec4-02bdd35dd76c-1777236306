-- Phase 4 #6: equipment maintenance log + service-due fields.
--
-- Equipment that needs periodic servicing (gas burners, refrigerated
-- units, generators) didn't have a place to record when it was last
-- serviced or when the next service is due. Operators kept this in
-- paper notebooks. Now: log every service event in
-- equipment_maintenance_log and roll up onto equipment.last_serviced
-- _at + next_service_due via trigger so list views can sort by
-- 'most overdue' without a join, and a cron can broadcast a
-- 'service due' notification when the date passes.

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS last_serviced_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS next_service_due DATE NULL,
  ADD COLUMN IF NOT EXISTS service_interval_days INTEGER NULL;

COMMENT ON COLUMN public.equipment.last_serviced_at IS
  'Phase 4 #6: stamped from equipment_maintenance_log on insert.';
COMMENT ON COLUMN public.equipment.next_service_due IS
  'Phase 4 #6: computed = last_serviced_at + service_interval_days, or set manually. NULL means no recurring service required.';
COMMENT ON COLUMN public.equipment.service_interval_days IS
  'Phase 4 #6: recurring schedule in days. NULL = no recurring service.';

CREATE TABLE IF NOT EXISTS public.equipment_maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  serviced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  serviced_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL DEFAULT 'routine',
  notes TEXT NULL,
  cost NUMERIC NULL,
  next_service_due DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_log_equipment
  ON public.equipment_maintenance_log (equipment_id, serviced_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_log_company
  ON public.equipment_maintenance_log (company_id, serviced_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_next_service_due
  ON public.equipment (company_id, next_service_due)
  WHERE next_service_due IS NOT NULL;

ALTER TABLE public.equipment_maintenance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_maintenance_log_select_same_company
  ON public.equipment_maintenance_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.company_id = equipment_maintenance_log.company_id
    )
  );

CREATE POLICY equipment_maintenance_log_insert_same_company
  ON public.equipment_maintenance_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.company_id = equipment_maintenance_log.company_id
    )
  );

CREATE OR REPLACE FUNCTION public.equipment_maintenance_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.equipment
     SET last_serviced_at = NEW.serviced_at,
         next_service_due = COALESCE(
           NEW.next_service_due,
           CASE WHEN equipment.service_interval_days IS NOT NULL
             THEN (NEW.serviced_at + (equipment.service_interval_days || ' days')::interval)::date
             ELSE equipment.next_service_due
           END
         ),
         updated_at = now()
   WHERE id = NEW.equipment_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_maintenance_rollup ON public.equipment_maintenance_log;
CREATE TRIGGER trg_equipment_maintenance_rollup
  AFTER INSERT ON public.equipment_maintenance_log
  FOR EACH ROW
  EXECUTE FUNCTION public.equipment_maintenance_rollup();
