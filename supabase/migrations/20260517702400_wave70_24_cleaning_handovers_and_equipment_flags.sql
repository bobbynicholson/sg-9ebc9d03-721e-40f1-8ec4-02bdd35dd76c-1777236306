-- Wave 70.24 -- cleaning handovers + per-equipment cleaning flags.
--
-- Three additions to make the cleaning portal predictive instead
-- of reactive:
--
-- 1. equipment gains requires_cleaning, dishwasher_safe, per-piece
--    cleaning time fields, is_hire_in, supplier_cleans. Without
--    these, the existing auto-trigger on status='delivered' spawns
--    a cleaning_jobs row for every booked equipment item -- forks
--    AND tables AND paper napkins -- and the cleaning queue
--    becomes useless noise. The new flag lets the trigger filter
--    to only items that actually need cleaning.
--
-- 2. cleaning_event_handovers -- one row per delivered order's
--    cleaning lifecycle. Acts as the event-level container the
--    cleaning portal groups jobs under. Lifecycle:
--      expected   -- created when the order moves to 'confirmed'
--      in_progress -- flipped when status='delivered' fires
--      complete   -- when every linked cleaning_job is done
--      cancelled  -- when the order is cancelled
--
-- 3. cleaning_jobs gains an optional event_handover_id link so the
--    existing jobs can be grouped by event in the UI without
--    breaking the legacy flat-list flow.
--
-- Backfill strategy: conservative. Default requires_cleaning=true
-- for everything; only flip to false for categories that are
-- clearly non-cleanable (tables, chairs, lighting, gas, decor).
-- Tenants edit per-item from the admin equipment form (Wave 70.25)
-- if the backfill got their setup wrong.

-- ── 1. Equipment table extensions ───────────────────────────────────

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS requires_cleaning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dishwasher_safe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleaning_time_manual_minutes numeric,
  ADD COLUMN IF NOT EXISTS cleaning_time_dishwasher_minutes numeric,
  ADD COLUMN IF NOT EXISTS is_hire_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_cleans boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.equipment.requires_cleaning IS
  'Wave 70.24 -- when true, this equipment generates a cleaning_jobs row on order delivery. Disposables, non-food-contact items, and supplier-cleaned hire-in should be false.';
COMMENT ON COLUMN public.equipment.dishwasher_safe IS
  'Wave 70.24 -- machine-washable. Drives the default cleaning method for new cleaning_jobs.';
COMMENT ON COLUMN public.equipment.cleaning_time_manual_minutes IS
  'Wave 70.24 -- per-piece manual wash time. Overrides the coarse cleaning_time_hours fallback in estimateJobMinutes.';
COMMENT ON COLUMN public.equipment.cleaning_time_dishwasher_minutes IS
  'Wave 70.24 -- per-piece dishwasher time. Used when machine capacity is not modelled (no machine_id on the job).';
COMMENT ON COLUMN public.equipment.is_hire_in IS
  'Wave 70.24 -- equipment rented IN from a supplier (vs the tenant''s own stock). Often the supplier cleans on return.';
COMMENT ON COLUMN public.equipment.supplier_cleans IS
  'Wave 70.24 -- when true and is_hire_in is true, the cleaning trigger skips this item (supplier handles it). Only meaningful when is_hire_in=true.';

-- Conservative category-driven backfill. Categories obviously
-- non-cleanable get the flag flipped. Everything else stays at the
-- default (true) so the tenant doesn't silently lose cleaning jobs.
UPDATE public.equipment
SET requires_cleaning = false
WHERE category IN ('tables', 'chairs', 'lighting', 'gas', 'decor');

-- Dishwasher-safe defaults for the obvious wash-machine categories.
UPDATE public.equipment
SET dishwasher_safe = true
WHERE category IN ('cutlery', 'crockery', 'glassware');

-- Per-piece time defaults so the auto-estimate works without the
-- tenant entering every field. Tenants can override per item later.
UPDATE public.equipment
SET cleaning_time_manual_minutes = 0.5
WHERE category = 'cutlery' AND cleaning_time_manual_minutes IS NULL;
UPDATE public.equipment
SET cleaning_time_manual_minutes = 1
WHERE category = 'crockery' AND cleaning_time_manual_minutes IS NULL;
UPDATE public.equipment
SET cleaning_time_manual_minutes = 1.5
WHERE category = 'glassware' AND cleaning_time_manual_minutes IS NULL;
UPDATE public.equipment
SET cleaning_time_manual_minutes = 10
WHERE category IN ('chafing', 'serving') AND cleaning_time_manual_minutes IS NULL;

-- ── 2. cleaning_event_handovers table ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.cleaning_event_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'expected'
    CHECK (status IN ('expected', 'in_progress', 'complete', 'cancelled')),
  expected_at timestamptz,
  in_progress_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  inspected_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_items_expected integer NOT NULL DEFAULT 0,
  total_items_returned integer NOT NULL DEFAULT 0,
  total_items_damaged integer NOT NULL DEFAULT 0,
  total_items_missing integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- One handover per order. Re-running the 'confirmed' trigger
  -- no-ops on the existing row instead of double-inserting.
  UNIQUE (company_id, order_id)
);

COMMENT ON TABLE public.cleaning_event_handovers IS
  'Wave 70.24 -- event-level container for cleaning_jobs. One row per delivered order. Created when an order hits ''confirmed'' (status=''expected''), flipped to ''in_progress'' on delivery, ''complete'' when all linked cleaning_jobs are done, ''cancelled'' when the order is cancelled.';

CREATE INDEX IF NOT EXISTS idx_handovers_company_status
  ON public.cleaning_event_handovers (company_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_handovers_expected_at
  ON public.cleaning_event_handovers (expected_at)
  WHERE deleted_at IS NULL AND status = 'expected';

CREATE INDEX IF NOT EXISTS idx_handovers_order
  ON public.cleaning_event_handovers (order_id)
  WHERE deleted_at IS NULL;

-- RLS -- same shape as cleaning_jobs: tenant-scoped via company_id.
ALTER TABLE public.cleaning_event_handovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "handovers_tenant_select" ON public.cleaning_event_handovers;
CREATE POLICY "handovers_tenant_select"
  ON public.cleaning_event_handovers
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "handovers_tenant_insert" ON public.cleaning_event_handovers;
CREATE POLICY "handovers_tenant_insert"
  ON public.cleaning_event_handovers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "handovers_tenant_update" ON public.cleaning_event_handovers;
CREATE POLICY "handovers_tenant_update"
  ON public.cleaning_event_handovers
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- updated_at trigger so the row's mtime tracks itself.
CREATE OR REPLACE FUNCTION public._handovers_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handovers_touch_updated_at ON public.cleaning_event_handovers;
CREATE TRIGGER handovers_touch_updated_at
  BEFORE UPDATE ON public.cleaning_event_handovers
  FOR EACH ROW
  EXECUTE FUNCTION public._handovers_touch_updated_at();

-- ── 3. cleaning_jobs -> handover link ───────────────────────────────

ALTER TABLE public.cleaning_jobs
  ADD COLUMN IF NOT EXISTS event_handover_id uuid
    REFERENCES public.cleaning_event_handovers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cleaning_jobs_handover
  ON public.cleaning_jobs (event_handover_id)
  WHERE event_handover_id IS NOT NULL;

COMMENT ON COLUMN public.cleaning_jobs.event_handover_id IS
  'Wave 70.24 -- optional link to the event-level handover this job belongs to. Backfilled on next status transition for legacy rows.';
