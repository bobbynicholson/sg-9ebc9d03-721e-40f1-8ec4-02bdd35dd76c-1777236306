-- Wave 41 (Phase 1, multi-role architecture).
--
-- cleaning_jobs answers the question Bobby surfaced:
--   "what we're tracking is how long things will take to clean
--    minimum so we know when it will be available for the next
--    function, and back into inventory."
--
-- This is the EQUIPMENT-AVAILABILITY ledger, deliberately separate
-- from labour cost. Three methods:
--   - dishwasher: machine_id set, no shift_task_id (no extra labour)
--   - manual: shift_task_id set (pulls a staffer; if billable=FALSE
--     on that task it still costs nothing -- they were on shift)
--   - outsourced_hire: hired in from a third party. Equipment
--     unavailable until it returns; cost lives outside payroll.
--
-- planned_end is the moment the equipment goes back into
-- inventory. That's the integration point for the "next function
-- availability" forecast.

CREATE TABLE IF NOT EXISTS public.cleaning_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_id          UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  method                TEXT NOT NULL CHECK (method IN ('dishwasher','manual','outsourced_hire')),
  -- Mutually exclusive in practice, but enforced soft -- a manual
  -- cleaning task could feed a follow-on dishwasher cycle later.
  machine_id            UUID REFERENCES public.cleaning_machines(id) ON DELETE SET NULL,
  shift_task_id         UUID REFERENCES public.staff_shift_tasks(id) ON DELETE SET NULL,
  planned_start         TIMESTAMPTZ NOT NULL,
  planned_end           TIMESTAMPTZ NOT NULL,
  actual_start          TIMESTAMPTZ,
  actual_end            TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','in_progress','complete','cancelled')),
  triggered_by_event_id UUID,    -- which event returned this gear
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  created_by_user_id    UUID,
  CONSTRAINT cleaning_jobs_window_valid CHECK (planned_end > planned_start)
);

CREATE INDEX IF NOT EXISTS cleaning_jobs_company_status_idx
  ON public.cleaning_jobs (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_jobs_equipment_idx
  ON public.cleaning_jobs (equipment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_jobs_window_idx
  ON public.cleaning_jobs (company_id, planned_end)
  WHERE deleted_at IS NULL AND status IN ('queued','in_progress');
CREATE INDEX IF NOT EXISTS cleaning_jobs_machine_idx
  ON public.cleaning_jobs (machine_id) WHERE machine_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.cleaning_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY cleaning_jobs_company_select
  ON public.cleaning_jobs FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

-- Cleaning + kitchen staff can write status updates (in_progress,
-- complete) on their own company's jobs. Admins can do anything.
CREATE POLICY cleaning_jobs_team_write
  ON public.cleaning_jobs FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role = ANY (ARRAY[
          'company_admin'::user_role,
          'admin'::user_role,
          'super_admin'::user_role,
          'cleaning_staff'::user_role,
          'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role = ANY (ARRAY[
          'company_admin'::user_role,
          'admin'::user_role,
          'super_admin'::user_role,
          'cleaning_staff'::user_role,
          'kitchen_staff'::user_role
        ])
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

COMMENT ON TABLE public.cleaning_jobs IS
  'Wave 41 Phase 1. Equipment-availability ledger (separate from labour cost). Three methods: dishwasher | manual | outsourced_hire. planned_end = when equipment returns to inventory.';
