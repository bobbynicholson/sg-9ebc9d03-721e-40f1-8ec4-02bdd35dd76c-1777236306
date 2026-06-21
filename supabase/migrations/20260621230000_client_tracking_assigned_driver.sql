-- Client live-tracking couldn't see the driver pin at all - only the venue.
--
-- Root cause: the client read policy on driver_locations matched the driver
-- against orders.driver_id ONLY. The dispatch flow assigns delivery to
-- orders.assigned_driver_id (driver_id is a legacy/secondary field), and the
-- GPS pings land under the ASSIGNED driver. So the EXISTS check never found a
-- matching order for the assigned driver's location row, RLS denied the read,
-- and the customer's map showed the venue pin but never the driver.
--
-- Fix: match on assigned_driver_id OR driver_id (and the secondary driver too,
-- so a two-driver job shows both). Tenant/ownership scoping is unchanged - the
-- client must still own the order (client_id link or matching client_email).
-- Idempotent.

DROP POLICY IF EXISTS client_tracking_read_driver_locations ON public.driver_locations;
CREATE POLICY client_tracking_read_driver_locations
  ON public.driver_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE (
              o.assigned_driver_id = driver_locations.driver_id
              OR o.driver_id = driver_locations.driver_id
              OR o.secondary_driver_id = driver_locations.driver_id
            )
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
