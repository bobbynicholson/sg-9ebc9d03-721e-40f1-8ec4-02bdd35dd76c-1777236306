-- Driver pay rate configuration (Stage 1 of the driver hourly-rate
-- build).
--
-- Audit found:
--   - profiles.hourly_rate already exists (DECIMAL 10,2) but had no UI
--     hook + no calculation pulling from it.
--   - driver_assignments.base_fee / distance_fee / total_earnings exist
--     but are never populated.
--   - orders.delivery_rate_per_km / delivery_fee already snapshot per
--     order (used in quotes).
--   - companies has no driver-rate defaults today.
--
-- This migration lays down:
--   1. Per-driver rate overrides (profiles.distance_rate_per_km,
--      profiles.base_callout_fee). hourly_rate already there.
--   2. Company-wide defaults (companies.default_driver_hourly_rate,
--      companies.default_distance_rate_per_km,
--      companies.default_base_callout_fee). Driver profile falls back
--      to these when its own override is NULL.
--
-- Stage 2 will add driver_shifts. Stage 3 wires the calculator.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS distance_rate_per_km NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS base_callout_fee     NUMERIC(10, 2);

COMMENT ON COLUMN public.profiles.distance_rate_per_km IS
  'Per-driver override for the per-km rate paid to this driver. NULL = use companies.default_distance_rate_per_km.';
COMMENT ON COLUMN public.profiles.base_callout_fee IS
  'Per-driver override for the flat fee paid every time the driver is dispatched (regardless of distance / hours). NULL = use companies.default_base_callout_fee.';
COMMENT ON COLUMN public.profiles.hourly_rate IS
  'Per-driver override for hours-on-site pay. NULL = use companies.default_driver_hourly_rate.';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_driver_hourly_rate   NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS default_distance_rate_per_km NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS default_base_callout_fee     NUMERIC(10, 2);

COMMENT ON COLUMN public.companies.default_driver_hourly_rate IS
  'Fallback hourly rate paid to drivers when their profile has no override. ZAR.';
COMMENT ON COLUMN public.companies.default_distance_rate_per_km IS
  'Fallback per-km rate paid to drivers when their profile has no override. ZAR per km. Distinct from any quote-level delivery rate charged to the customer.';
COMMENT ON COLUMN public.companies.default_base_callout_fee IS
  'Fallback flat callout fee paid to drivers per dispatch when their profile has no override. ZAR.';
