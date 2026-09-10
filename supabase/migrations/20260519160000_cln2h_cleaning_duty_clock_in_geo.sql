-- CLN2-H (CLN2-68): GPS clock-in on cleaning duty. We capture
-- lat / lng / accuracy at clock-in time so the admin can sense-check
-- whether the cleaner actually started the shift on-site. All three
-- columns are nullable - the device may deny geolocation, the lookup
-- may time out, or the browser may not support it; the cleaner still
-- needs to be able to clock in either way.

ALTER TABLE public.cleaning_duty_logs
  ADD COLUMN IF NOT EXISTS clock_in_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS clock_in_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS clock_in_accuracy_m NUMERIC;

COMMENT ON COLUMN public.cleaning_duty_logs.clock_in_lat IS
  'CLN2-H (CLN2-68) - geographic latitude captured at clock-in. Best-effort: NULL when the device denied geolocation or the lookup timed out.';
COMMENT ON COLUMN public.cleaning_duty_logs.clock_in_lng IS
  'CLN2-H (CLN2-68) - geographic longitude captured at clock-in.';
COMMENT ON COLUMN public.cleaning_duty_logs.clock_in_accuracy_m IS
  'CLN2-H (CLN2-68) - reported HTML5 geolocation accuracy in metres. Admin uses this to sense-check whether the cleaner clocked in on-site.';
