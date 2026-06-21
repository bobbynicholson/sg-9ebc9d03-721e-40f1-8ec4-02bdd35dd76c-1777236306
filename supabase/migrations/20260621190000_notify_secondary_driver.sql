-- Notify the secondary driver whenever orders.secondary_driver_id is set,
-- regardless of HOW it's set (admin dropdown, API endpoint, stale client
-- code, a script, or a future surface). The app-side notification kept not
-- landing because the write path that set the column didn't reliably also
-- insert the cross-user notification (browser RLS / stale bundle / endpoint
-- not reached). A trigger removes all of that: the row is inserted in the
-- same transaction that sets the column, in a SECURITY DEFINER context that
-- bypasses RLS.
--
-- Fires only when secondary_driver_id actually CHANGES to a non-null value,
-- so clearing it or re-saving the same driver doesn't re-ping. Idempotent
-- (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). Safe to run in the SQL editor.

CREATE OR REPLACE FUNCTION public.notify_secondary_driver_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.secondary_driver_id IS NOT NULL
     AND NEW.secondary_driver_id IS DISTINCT FROM OLD.secondary_driver_id THEN
    INSERT INTO public.notifications (
      company_id, user_id, recipient_id, notification_type, title, message,
      priority, link, related_entity_type, related_entity_id, target_role
    ) VALUES (
      NEW.company_id,
      NEW.secondary_driver_id,
      NEW.secondary_driver_id,
      'driver_assigned',
      'Secondary delivery assignment',
      'You''re the second driver on order ' || COALESCE(NEW.order_number, '') ||
        '. Open Deliveries for the details.',
      'high',
      '/team-portal/driver/deliveries',
      'order',
      NEW.id,
      'driver'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_secondary_driver ON public.orders;
CREATE TRIGGER trg_notify_secondary_driver
  AFTER UPDATE OF secondary_driver_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_secondary_driver_assigned();
