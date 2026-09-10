-- gps_tracking.company_id - so the live ops realtime channel can
-- filter server-side instead of relying on a handler-side driver_id
-- match (which still let cross-tenant payloads ride the wire).
--
-- Strategy:
--   1. Add nullable company_id.
--   2. Backfill from driver_id -> profiles.company_id.
--   3. Trigger to auto-populate on insert so the driver app pinger
--      doesn't need to know about company_id.
--   4. Index for the realtime filter to be fast at scale.
--   5. RLS policies left as-is (existing scoping is via driver_id
--      relationship); the realtime filter is a defence-in-depth.
--
-- NOT NULL is deferred - we can't be sure all writers populate yet,
-- and a NOT NULL on a hot-path table mid-traffic risks blowing up
-- the driver app's GPS pinger if a profile lookup fails. The trigger
-- below means new rows will have it set; legacy nulls disappear from
-- the realtime stream because the filter `company_id=eq.X` skips
-- them. That's fine.

ALTER TABLE public.gps_tracking
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Backfill: link each existing row to the company via the driver's
-- profile. This is a one-off cost; on a tenant with 100k pins it's
-- a single UPDATE, a few seconds.
UPDATE public.gps_tracking g
SET company_id = p.company_id
FROM public.profiles p
WHERE g.driver_id = p.id
  AND g.company_id IS NULL;

-- Trigger to keep the column populated on new inserts. SECURITY
-- DEFINER so the trigger can read profiles even when the pinger
-- session can't (e.g. the driver app's anon session lookup).
CREATE OR REPLACE FUNCTION public.set_gps_tracking_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.driver_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM public.profiles
    WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_gps_tracking_company_id_trg ON public.gps_tracking;
CREATE TRIGGER set_gps_tracking_company_id_trg
BEFORE INSERT ON public.gps_tracking
FOR EACH ROW EXECUTE FUNCTION public.set_gps_tracking_company_id();

-- Index for the realtime filter. postgres_changes filters on the
-- value but won't help much without an index when the publisher
-- evaluates which subscribers care about the row.
CREATE INDEX IF NOT EXISTS idx_gps_tracking_company_id
  ON public.gps_tracking(company_id);
