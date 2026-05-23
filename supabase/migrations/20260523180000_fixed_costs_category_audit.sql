-- FXC-B (fixed costs deferred follow-ups, 2026-05-23):
--
-- 1. category - text with CHECK constraint. Powers the group-by-
--    category view and per-category insights on /admin/fixed-costs.
--    Backfilled NULL on existing rows - the UI treats NULL as
--    "Uncategorised" so the migration is non-breaking. Categories
--    cover the cost types every operating catering business has:
--    rent, telecoms, vehicle, insurance, software, banking,
--    utilities, payroll_software, professional_services, other.
--
-- 2. previous_amount_cents + last_amount_change_at - lets the page
--    surface "R1,800 (was R1,500, 14 mo ago)" and a "Renegotiate?"
--    chip when a row has been at the same amount for 12+ months.
--    Maintained by a trigger on UPDATE so the application doesn't
--    have to remember to set them; the renegotiation surfacing is
--    automatic.
--
-- 3. Pure additive migration. Drops nothing, alters nothing
--    semantically. Rolling back means dropping the three columns +
--    trigger.

ALTER TABLE public.fixed_costs
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.fixed_costs
  ADD CONSTRAINT fixed_costs_category_chk
  CHECK (
    category IS NULL OR category IN (
      'rent',
      'telecoms',
      'vehicle',
      'insurance',
      'software',
      'banking',
      'utilities',
      'payroll_software',
      'professional_services',
      'other'
    )
  );

ALTER TABLE public.fixed_costs
  ADD COLUMN IF NOT EXISTS previous_amount_cents bigint
    CHECK (previous_amount_cents IS NULL OR previous_amount_cents >= 0);

ALTER TABLE public.fixed_costs
  ADD COLUMN IF NOT EXISTS last_amount_change_at timestamptz;

-- Trigger: when amount_cents changes, snapshot the previous value
-- and stamp last_amount_change_at. This is the source for the
-- renegotiation chip ("Same amount for 18 months - renegotiate?").
-- INSERTs do NOT set last_amount_change_at - that field stays NULL
-- until the first edit, so a brand-new row doesn't immediately read
-- as "unchanged forever".
CREATE OR REPLACE FUNCTION public._fixed_costs_track_amount_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN
    NEW.previous_amount_cents := OLD.amount_cents;
    NEW.last_amount_change_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fixed_costs_track_amount_change ON public.fixed_costs;
CREATE TRIGGER fixed_costs_track_amount_change
  BEFORE UPDATE ON public.fixed_costs
  FOR EACH ROW EXECUTE FUNCTION public._fixed_costs_track_amount_change();

COMMENT ON COLUMN public.fixed_costs.category IS
  'FXC-B: category for grouping on /admin/fixed-costs. NULL = uncategorised. Enum-style check constraint instead of pg enum so adding categories later doesnt require an enum-alter migration.';

COMMENT ON COLUMN public.fixed_costs.previous_amount_cents IS
  'FXC-B: snapshot of the amount before the most recent change. Maintained by trigger. Powers the "was R X" annotation under the current amount.';

COMMENT ON COLUMN public.fixed_costs.last_amount_change_at IS
  'FXC-B: timestamp of the most recent amount change. Maintained by trigger. NULL on rows that have never been edited. Powers the "Renegotiate?" chip when the row has been at the same amount for >= 12 months.';
