-- Wave 41 (Phase 1, multi-role architecture).
--
-- cleaning_machines = the dishwasher (or future tunnel washer, etc).
-- Capacity model lets the planner answer "if 80 dirty plates come
-- back, how long until they're back in inventory?" without pulling
-- a kitchen staffer off the line.
--
-- Bobby's rule: dishwasher = quicker AND doesn't pull a person.
-- So a cleaning_jobs row with method='dishwasher' has NO matching
-- staff_shift_tasks row -- the labour is the machine running.

CREATE TABLE IF NOT EXISTS public.cleaning_machines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  machine_type       TEXT NOT NULL DEFAULT 'dishwasher'
                     CHECK (machine_type IN ('dishwasher','tunnel_washer','glass_washer','other')),
  cycle_minutes      INTEGER NOT NULL DEFAULT 4
                     CHECK (cycle_minutes > 0),
  items_per_cycle    INTEGER NOT NULL DEFAULT 50
                     CHECK (items_per_cycle > 0),
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  created_by_user_id UUID
);

CREATE INDEX IF NOT EXISTS cleaning_machines_company_idx
  ON public.cleaning_machines (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cleaning_machines_active_idx
  ON public.cleaning_machines (company_id, active) WHERE deleted_at IS NULL;

ALTER TABLE public.cleaning_machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY cleaning_machines_company_select
  ON public.cleaning_machines FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY cleaning_machines_admin_write
  ON public.cleaning_machines FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role = ANY (ARRAY['company_admin'::user_role, 'admin'::user_role, 'super_admin'::user_role])
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

COMMENT ON TABLE public.cleaning_machines IS
  'Wave 41 Phase 1. Tenant dishwashers / washers. Capacity (cycle_minutes, items_per_cycle) feeds the planner that decides dishwasher vs manual cleaning.';
