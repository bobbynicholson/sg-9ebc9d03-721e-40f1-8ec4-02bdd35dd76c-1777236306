-- Notify the driver when the kitchen signs the order over to them
-- (equipment_handovers row from_stage='kitchen' -> to_stage='driver').
-- Before this, signing over toasted the KITCHEN but the driver got no
-- "you're cleared to depart / load is ready" ping. A trigger fires it in
-- the same transaction as the sign-over (SECURITY DEFINER, RLS-proof) so it
-- works no matter which surface the kitchen used. Idempotent.

CREATE OR REPLACE FUNCTION public.notify_driver_of_kitchen_handover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver uuid;
  v_company uuid;
  v_order_number text;
BEGIN
  IF NEW.from_stage = 'kitchen' AND NEW.to_stage = 'driver' THEN
    SELECT assigned_driver_id, company_id, order_number
      INTO v_driver, v_company, v_order_number
      FROM public.orders
     WHERE id = NEW.order_id;

    -- Prefer the explicit receiver on the handover row; fall back to the
    -- order's assigned driver.
    v_driver := COALESCE(NEW.received_by_user_id, NEW.received_by, v_driver);

    IF v_driver IS NOT NULL AND v_company IS NOT NULL THEN
      INSERT INTO public.notifications (
        company_id, user_id, recipient_id, notification_type, title, message,
        priority, link, related_entity_type, related_entity_id, target_role
      ) VALUES (
        v_company, v_driver, v_driver,
        'driver_assigned',
        'Kitchen handed over - cleared to depart',
        'The kitchen has signed Order #' || COALESCE(v_order_number, '') ||
          ' over to you. The load is ready - you''re cleared to depart.',
        'high',
        '/team-portal/driver/deliveries',
        'order',
        NEW.order_id,
        'driver'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_driver_handover ON public.equipment_handovers;
CREATE TRIGGER trg_notify_driver_handover
  AFTER INSERT ON public.equipment_handovers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_of_kitchen_handover();
