-- Wave 40.1: drop load_plans table.
--
-- Skeleton table (id, company_id, event_id, verified_by, created_at)
-- intended for "verify the truck load before dispatch" but referenced
-- by ZERO code outside the auto-generated supabase types file.
-- 0 rows in prod. Same shape as driver_replacement_requests
-- (driver-side orphan deleted in this wave too).
--
-- Drop now to keep the schema honest. If load verification ever ships
-- as a real feature, it can land with a fresh table designed for the
-- final use case rather than this skeletal placeholder.

DROP TABLE IF EXISTS public.load_plans CASCADE;
