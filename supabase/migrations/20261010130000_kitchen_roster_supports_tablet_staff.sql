-- The kitchen tablet supports staff-directory members who do not have their
-- own application login.  The original roster only accepted profiles, so
-- those real, clocked-in people could never be scheduled or matched to their
-- attendance.  Keep profile-backed shifts fully compatible and add the
-- directory identity as an alternative for kitchen rosters.

ALTER TABLE public.kitchen_shifts
  ADD COLUMN IF NOT EXISTS staff_member_id UUID
    REFERENCES public.kitchen_staff_members(id) ON DELETE CASCADE;

ALTER TABLE public.kitchen_shifts
  ALTER COLUMN staff_id DROP NOT NULL;

ALTER TABLE public.kitchen_shifts
  DROP CONSTRAINT IF EXISTS kitchen_shifts_requires_staff_identity;

ALTER TABLE public.kitchen_shifts
  ADD CONSTRAINT kitchen_shifts_requires_staff_identity
  CHECK (staff_id IS NOT NULL OR staff_member_id IS NOT NULL);

-- Existing profile-backed uniqueness is retained. This complementary index
-- gives tablet-only workers the same one-shift-per-day-per-role protection.
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_shifts_one_staff_member_role_per_day
  ON public.kitchen_shifts (staff_member_id, shift_date, shift_type)
  WHERE deleted_at IS NULL AND staff_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kitchen_shifts_staff_member_open_idx
  ON public.kitchen_shifts (staff_member_id)
  WHERE actual_end IS NULL AND deleted_at IS NULL AND staff_member_id IS NOT NULL;

COMMENT ON COLUMN public.kitchen_shifts.staff_member_id IS
  'Kitchen tablet staff-directory member. Used when a rostered kitchen worker has no linked profiles row.';
