-- Wave 41 (Phase 1, multi-role architecture).
--
-- Per-item cleaning metadata so the planner can decide method
-- automatically. Bobby's rule: "if dishwashed much quicker and
-- doesn't pull a team member from the kitchen. If manual cleaning,
-- a kitchen member will be moved to cleaning for that period
-- needed."
--
-- The existing equipment.cleaning_time_hours column stays for
-- back-compat. The new minutes columns give finer resolution per
-- method and feed cleaning_jobs.planned_end calculation.
--
-- dishwasher_safe = NULL means "unknown / operator hasn't told us"
-- and the planner falls back to manual.

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS dishwasher_safe                 BOOLEAN,
  ADD COLUMN IF NOT EXISTS cleaning_time_manual_minutes    INTEGER
    CHECK (cleaning_time_manual_minutes IS NULL OR cleaning_time_manual_minutes >= 0),
  ADD COLUMN IF NOT EXISTS cleaning_time_dishwasher_minutes INTEGER
    CHECK (cleaning_time_dishwasher_minutes IS NULL OR cleaning_time_dishwasher_minutes >= 0);

COMMENT ON COLUMN public.equipment.dishwasher_safe IS
  'Wave 41. NULL = unknown (planner falls back to manual). TRUE/FALSE explicit.';
COMMENT ON COLUMN public.equipment.cleaning_time_manual_minutes IS
  'Wave 41. Per-unit manual cleaning time. Feeds cleaning_jobs.planned_end when method=manual.';
COMMENT ON COLUMN public.equipment.cleaning_time_dishwasher_minutes IS
  'Wave 41. Per-unit dishwasher cycle time (different from machine cycle_minutes -- this is wear time per piece).';
