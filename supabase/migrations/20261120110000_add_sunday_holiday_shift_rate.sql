-- Store the full amount payable for a Sunday or public-holiday shift.
-- NULL keeps the default at 2x the staff member's ordinary shift rate.
ALTER TABLE public.kitchen_staff_members
  ADD COLUMN IF NOT EXISTS sunday_holiday_shift_rate numeric(10, 2);

COMMENT ON COLUMN public.kitchen_staff_members.sunday_holiday_shift_rate IS
  'Full per-shift amount for Sunday/public-holiday work. NULL defaults to 2x shift_rate.';
