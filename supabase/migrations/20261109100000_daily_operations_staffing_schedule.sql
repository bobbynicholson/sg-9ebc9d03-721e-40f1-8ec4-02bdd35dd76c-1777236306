-- Allow daily operations tasks to follow selected weekdays or the live team roster.
-- Existing task configurations start in staff-scheduled mode so closed days do
-- not keep generating empty cleaning work.

ALTER TABLE public.company_daily_operations_settings
  ADD COLUMN IF NOT EXISTS kitchen_cleaning_schedule_mode text NOT NULL DEFAULT 'staff_scheduled',
  ADD COLUMN IF NOT EXISTS kitchen_cleaning_weekdays integer[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 0]::integer[],
  ADD COLUMN IF NOT EXISTS equipment_cleaning_schedule_mode text NOT NULL DEFAULT 'staff_scheduled',
  ADD COLUMN IF NOT EXISTS equipment_cleaning_weekdays integer[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 0]::integer[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_daily_operations_kitchen_schedule_mode_check'
      AND conrelid = 'public.company_daily_operations_settings'::regclass
  ) THEN
    ALTER TABLE public.company_daily_operations_settings
      ADD CONSTRAINT company_daily_operations_kitchen_schedule_mode_check
      CHECK (kitchen_cleaning_schedule_mode IN ('every_day', 'selected_weekdays', 'staff_scheduled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_daily_operations_equipment_schedule_mode_check'
      AND conrelid = 'public.company_daily_operations_settings'::regclass
  ) THEN
    ALTER TABLE public.company_daily_operations_settings
      ADD CONSTRAINT company_daily_operations_equipment_schedule_mode_check
      CHECK (equipment_cleaning_schedule_mode IN ('every_day', 'selected_weekdays', 'staff_scheduled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_daily_operations_kitchen_weekdays_check'
      AND conrelid = 'public.company_daily_operations_settings'::regclass
  ) THEN
    ALTER TABLE public.company_daily_operations_settings
      ADD CONSTRAINT company_daily_operations_kitchen_weekdays_check
      CHECK (cardinality(kitchen_cleaning_weekdays) BETWEEN 1 AND 7
        AND kitchen_cleaning_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_daily_operations_equipment_weekdays_check'
      AND conrelid = 'public.company_daily_operations_settings'::regclass
  ) THEN
    ALTER TABLE public.company_daily_operations_settings
      ADD CONSTRAINT company_daily_operations_equipment_weekdays_check
      CHECK (cardinality(equipment_cleaning_weekdays) BETWEEN 1 AND 7
        AND equipment_cleaning_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]);
  END IF;
END
$$;

COMMENT ON COLUMN public.company_daily_operations_settings.kitchen_cleaning_schedule_mode IS
  'every_day, selected_weekdays, or staff_scheduled. Staff-scheduled mode follows kitchen_shifts for the task target.';
COMMENT ON COLUMN public.company_daily_operations_settings.equipment_cleaning_schedule_mode IS
  'every_day, selected_weekdays, or staff_scheduled. Staff-scheduled mode follows kitchen_shifts for the task target.';

-- Rename the previous built-in task titles so the label describes the work,
-- while the schedule controls explain when it happens.
UPDATE public.company_daily_operations_settings
SET kitchen_cleaning_title = 'Kitchen area cleaning'
WHERE lower(btrim(kitchen_cleaning_title)) IN ('daily kitchen clean', 'daily kitchen cleaning');

UPDATE public.company_daily_operations_settings
SET equipment_cleaning_title = 'Kitchen equipment cleaning'
WHERE lower(btrim(equipment_cleaning_title)) IN (
  'daily kitchen-equipment clean',
  'daily kitchen equipment clean',
  'daily kitchen & equipment clean',
  'daily kitchen equipment cleaning'
);

UPDATE public.daily_operations_tasks
SET title = 'Kitchen area cleaning'
WHERE lower(btrim(title)) IN ('daily kitchen clean', 'daily kitchen cleaning');

UPDATE public.daily_operations_tasks
SET title = 'Kitchen equipment cleaning'
WHERE lower(btrim(title)) IN (
  'daily kitchen-equipment clean',
  'daily kitchen equipment clean',
  'daily kitchen & equipment clean',
  'daily kitchen equipment cleaning'
);
