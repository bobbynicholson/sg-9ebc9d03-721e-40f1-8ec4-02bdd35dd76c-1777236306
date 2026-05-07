-- P1-23 from the 2026-05 megaprogramme audit.
--
-- Splits the GPS schema into "current state" and "history log":
--   - driver_locations (NEW): one row per driver, driver_id PRIMARY KEY,
--     UPSERTed with every ping. The "where is the driver right now"
--     query becomes a single-row PK lookup.
--   - gps_tracking (existing): append-only history log. New code never
--     UPSERTs into this; it just INSERTs.
--
-- The original gps_tracking upsert path called onConflict("driver_id")
-- against a table where driver_id wasn't unique. Outcome was undefined
-- (effectively "insert a new row every time" so history accumulated and
-- "current location" reads needed an order-by-timestamp limit-1).

CREATE TABLE IF NOT EXISTS public.driver_locations (
  driver_id  uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Denormalised so RLS can scope without an extra join through profiles.
  -- Mirrors the convention on orders / clients / etc.
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  latitude   double precision,
  longitude  double precision,
  accuracy   double precision,
  heading    double precision,
  speed      double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_company_id
  ON public.driver_locations(company_id);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Driver writes their own row (UPSERT == INSERT-or-UPDATE so we need
-- both INSERT and UPDATE write paths).
DROP POLICY IF EXISTS driver_upsert_own_location ON public.driver_locations;
CREATE POLICY driver_upsert_own_location
  ON public.driver_locations
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS driver_update_own_location ON public.driver_locations;
CREATE POLICY driver_update_own_location
  ON public.driver_locations
  FOR UPDATE TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- Driver reads their own row.
DROP POLICY IF EXISTS driver_read_own_location ON public.driver_locations;
CREATE POLICY driver_read_own_location
  ON public.driver_locations
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

-- Same-company staff (anyone who isn't a client) reads any driver
-- in their tenant. Mirrors the company_view_gps pattern from
-- gps_tracking but using the denormalised company_id so the check
-- is a pure index lookup instead of a join.
DROP POLICY IF EXISTS company_staff_read_driver_locations ON public.driver_locations;
CREATE POLICY company_staff_read_driver_locations
  ON public.driver_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role <> 'client'::user_role
        AND me.company_id = driver_locations.company_id
    )
    OR is_super_admin()
  );

-- A client whose order is assigned to this driver can read that
-- driver's current location for live tracking. Mirrors the orders-
-- join branch on gps_tracking.
DROP POLICY IF EXISTS client_tracking_read_driver_locations ON public.driver_locations;
CREATE POLICY client_tracking_read_driver_locations
  ON public.driver_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.driver_id = driver_locations.driver_id
        AND (
          o.client_id IN (
            SELECT clients.id FROM public.clients
            WHERE clients.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'client'::user_role
              AND p.company_id = o.company_id
              AND lower(p.email) = lower(o.client_email)
          )
        )
    )
  );

-- Backfill from the latest gps_tracking row per driver. One-shot --
-- new code writes to both tables going forward.
INSERT INTO public.driver_locations (driver_id, company_id, latitude, longitude, accuracy, heading, speed, updated_at)
SELECT
  latest.driver_id,
  prof.company_id,
  latest.latitude,
  latest.longitude,
  latest.accuracy,
  latest.heading,
  latest.speed,
  COALESCE(latest.timestamp, now())
FROM (
  SELECT DISTINCT ON (driver_id)
    driver_id, latitude, longitude, accuracy, heading, speed, timestamp
  FROM public.gps_tracking
  WHERE driver_id IS NOT NULL
  ORDER BY driver_id, timestamp DESC NULLS LAST
) latest
LEFT JOIN public.profiles prof ON prof.id = latest.driver_id
ON CONFLICT (driver_id) DO NOTHING;
