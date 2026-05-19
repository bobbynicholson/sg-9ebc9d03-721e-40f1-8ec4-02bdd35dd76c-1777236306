-- CLN2-F (cleaning deep audit, CLN2-15).
--
-- Pre-event cleanliness checklist - the formal closure of the
-- cleaning to kitchen-readiness loop. KIT2-O (#129) wired a v1 chip
-- off the cleaning_jobs equipment ledger; that signal answers
-- "is the gear back" not "is the venue / prep area itself ready
-- for the chef to start tomorrow". CLN2-F adds the second signal.
--
-- One row per (order, kind). items is a jsonb array of
-- {label, required, checked, checked_at, checked_by}. The kind
-- column is forward-compat: a "delivery_ready" checklist (driver
-- side) re-uses the table without a schema fork.
--
-- Per-tenant override of the default template lives on
-- companies.cleaning_checklist_template (jsonb). Null means
-- the 5-item default applies.

CREATE TABLE IF NOT EXISTS public.cleaning_event_checklists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'pre_event'
              CHECK (kind IN ('pre_event','delivery_ready')),
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','ready')),
  ready_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- One active checklist per (order, kind). Soft-deleted rows are
-- ignored so re-creating after a delete works.
CREATE UNIQUE INDEX IF NOT EXISTS cleaning_event_checklists_order_kind_active_idx
  ON public.cleaning_event_checklists (order_id, kind)
  WHERE deleted_at IS NULL;

-- Lookup index for the kitchen-chip query (tomorrow's events,
-- ready count). Partial on deleted_at to keep it small.
CREATE INDEX IF NOT EXISTS cleaning_event_checklists_company_order_status_idx
  ON public.cleaning_event_checklists (company_id, order_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.cleaning_event_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY cleaning_event_checklists_company_select
  ON public.cleaning_event_checklists FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

-- Cleaning + kitchen staff can tick items + drive the status.
-- Same roleset as cleaning_jobs_team_write (PR #41) - if you can
-- log the equipment cycle you can log the room check.
CREATE POLICY cleaning_event_checklists_team_write
  ON public.cleaning_event_checklists FOR ALL
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

COMMENT ON TABLE public.cleaning_event_checklists IS
  'CLN2-F. Pre-event cleanliness checklist (and future delivery-ready checklist via kind column). items jsonb is [{label, required, checked, checked_at, checked_by}]. status flips to ready + ready_at stamps when the last required item ticks.';


-- Per-tenant template override. Null = use the hardcoded default
-- (Surfaces wiped / Equipment washed / Bins out / Floor mopped /
-- Fridge spot-checked). Admin /admin/cleaning will edit this in a
-- follow-up; today we only need the column to exist so the read
-- path can prefer it when populated.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cleaning_checklist_template JSONB;

COMMENT ON COLUMN public.companies.cleaning_checklist_template IS
  'CLN2-F. Per-tenant override for the pre-event cleanliness checklist items. Null = default. Shape: [{label, required}].';
