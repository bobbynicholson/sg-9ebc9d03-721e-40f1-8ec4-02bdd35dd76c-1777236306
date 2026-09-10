-- Wave 41 (Phase 1, multi-role architecture).
--
-- staff_shift_tasks lets one parent shift contain multiple typed
-- task rows. Solves Bobby's two pillars:
--   (a) "driver might also do delivery, shopping, waitering" --
--       one shift, many task chips.
--   (b) "if someone is on shift and they do cleaning, there
--       shouldn't be an extra cost" -- task rows carry billable=
--       FALSE so the labour stays inside the parent shift's pay
--       envelope. Equipment availability is still tracked via
--       cleaning_jobs (separate concern).
--
-- shift_id points at kitchen_shifts.id today. Phase 4 will rename
-- kitchen_shifts -> staff_shifts and fold driver_shifts in; the FK
-- name will follow.

CREATE TABLE IF NOT EXISTS public.staff_shift_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id            UUID NOT NULL REFERENCES public.kitchen_shifts(id) ON DELETE CASCADE,
  task_type           TEXT NOT NULL CHECK (task_type IN (
                        'kitchen','cleaning','delivery','shopping',
                        'waitering','setup','breakdown','admin'
                      )),
  planned_start       TIMESTAMPTZ,
  planned_end         TIMESTAMPTZ,
  actual_start        TIMESTAMPTZ,
  actual_end          TIMESTAMPTZ,
  planned_minutes     INTEGER,
  -- billable=FALSE means this task is covered by the parent shift's
  -- existing pay -- payroll skips it. Used when a kitchen staffer
  -- handles a 10-min cleaning task mid-shift.
  billable            BOOLEAN NOT NULL DEFAULT TRUE,
  related_entity_type TEXT,
  related_entity_id   UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  created_by_user_id  UUID
);

CREATE INDEX IF NOT EXISTS staff_shift_tasks_shift_idx
  ON public.staff_shift_tasks (shift_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_shift_tasks_company_type_idx
  ON public.staff_shift_tasks (company_id, task_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_shift_tasks_related_idx
  ON public.staff_shift_tasks (related_entity_type, related_entity_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.staff_shift_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_shift_tasks_company_select
  ON public.staff_shift_tasks FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

CREATE POLICY staff_shift_tasks_admin_write
  ON public.staff_shift_tasks FOR ALL
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

COMMENT ON TABLE public.staff_shift_tasks IS
  'Wave 41 Phase 1. Per-shift task rows (kitchen/cleaning/delivery/shopping/waitering/setup/breakdown/admin). billable=FALSE = no extra cost, labour falls under parent shift.';
