-- Wave 24 follow-up: the legacy trigger from
-- 20260425220620_migration_f2d0c3b8.sql fires whenever orders.status
-- flips to 'ready' - but in practice the status column gets nudged to
-- 'ready' by paths that aren't kitchen confirmation (admin force-edits,
-- legacy direct UPDATEs, smoke tests). That trains drivers to ignore
-- the bell.
--
-- Bobby's rule: only ping the driver when EITHER the kitchen has
-- actually stamped ready_at, OR the collection time on the order has
-- arrived. We gate the trigger on those two signals so a stray status
-- flip without supporting evidence is silently ignored.
--
-- pickup_time is "time without time zone" (time-of-day on event_date),
-- collection_time is a full timestamptz. We accept either.

CREATE OR REPLACE FUNCTION notify_driver_order_ready()
RETURNS TRIGGER AS $$
DECLARE
  v_driver_id UUID;
  v_driver_name TEXT;
  v_order_number TEXT;
  v_client_name TEXT;
  v_venue_address TEXT;
  v_company_id UUID;
  v_kitchen_confirmed BOOLEAN;
  v_collection_arrived BOOLEAN;
  v_pickup_ts TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'ready' AND (OLD.status IS NULL OR OLD.status != 'ready') THEN

    -- Signal 1: kitchen actually marked ready (ready_at stamped this
    -- update or earlier in the workflow).
    v_kitchen_confirmed := NEW.ready_at IS NOT NULL;

    -- Signal 2: the on-order collection time has arrived. We treat
    -- collection_time (timestamptz) as authoritative; if it's null we
    -- fall back to pickup_time combined with event_date.
    v_collection_arrived := FALSE;
    IF NEW.collection_time IS NOT NULL THEN
      v_collection_arrived := NEW.collection_time <= NOW();
    ELSIF NEW.pickup_time IS NOT NULL AND NEW.event_date IS NOT NULL THEN
      v_pickup_ts := (NEW.event_date + NEW.pickup_time)::TIMESTAMPTZ;
      v_collection_arrived := v_pickup_ts <= NOW();
    END IF;

    IF NOT (v_kitchen_confirmed OR v_collection_arrived) THEN
      -- Status flipped to ready without kitchen confirmation and
      -- before collection time - swallow it. The kitchen confirm
      -- flow will fire ready_at later and re-trigger this function.
      RETURN NEW;
    END IF;

    -- Resolve driver: prefer the assigned_driver_id / driver_id on the
    -- order, fall back to the active driver_assignments row.
    v_driver_id := NEW.driver_id;

    IF v_driver_id IS NULL THEN
      SELECT driver_id INTO v_driver_id
      FROM driver_assignments
      WHERE order_id = NEW.id
        AND status IN ('assigned', 'accepted')
      ORDER BY assigned_at DESC
      LIMIT 1;
    END IF;

    IF v_driver_id IS NOT NULL THEN
      SELECT full_name INTO v_driver_name
      FROM profiles
      WHERE id = v_driver_id;

      v_order_number := NEW.order_number;
      v_client_name := NEW.client_name;
      v_venue_address := NEW.venue_address;
      v_company_id := NEW.company_id;

      INSERT INTO notifications (
        company_id,
        user_id,
        recipient_id,
        notification_type,
        type,
        title,
        message,
        link,
        priority,
        target_role,
        is_read,
        created_at,
        related_entity_type,
        related_entity_id
      ) VALUES (
        v_company_id,
        v_driver_id,
        v_driver_id,
        'order_ready',
        'order_ready',
        'Order Ready for Pickup',
        format('Order %s for %s is ready. Pickup location: %s',
          v_order_number,
          v_client_name,
          v_venue_address
        ),
        '/team-portal/driver/routes',
        'urgent',
        'driver',
        false,
        NOW(),
        'order',
        NEW.id
      );

      RAISE NOTICE 'Driver notification created for order % - Driver: %',
        v_order_number, v_driver_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition is unchanged, but recreate to be safe.
DROP TRIGGER IF EXISTS trigger_notify_driver_order_ready ON orders;

CREATE TRIGGER trigger_notify_driver_order_ready
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_driver_order_ready();
