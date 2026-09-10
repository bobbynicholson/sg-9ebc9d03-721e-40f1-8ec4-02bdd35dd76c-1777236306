-- Create function to notify driver when order is ready for pickup
CREATE OR REPLACE FUNCTION notify_driver_order_ready()
RETURNS TRIGGER AS $$
DECLARE
  v_driver_id UUID;
  v_driver_name TEXT;
  v_order_number TEXT;
  v_client_name TEXT;
  v_venue_address TEXT;
  v_company_id UUID;
BEGIN
  -- Only proceed if status changed TO 'ready'
  IF NEW.status = 'ready' AND (OLD.status IS NULL OR OLD.status != 'ready') THEN
    
    -- Get driver_id (check both order.driver_id and driver_assignments)
    v_driver_id := NEW.driver_id;
    
    -- If not set directly on order, check driver_assignments
    IF v_driver_id IS NULL THEN
      SELECT driver_id INTO v_driver_id
      FROM driver_assignments
      WHERE order_id = NEW.id
        AND status IN ('assigned', 'accepted')
      ORDER BY assigned_at DESC
      LIMIT 1;
    END IF;
    
    -- Only create notification if driver is assigned
    IF v_driver_id IS NOT NULL THEN
      
      -- Get driver name
      SELECT full_name INTO v_driver_name
      FROM profiles
      WHERE id = v_driver_id;
      
      -- Get order details
      v_order_number := NEW.order_number;
      v_client_name := NEW.client_name;
      v_venue_address := NEW.venue_address;
      v_company_id := NEW.company_id;
      
      -- Create notification for driver
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
        created_at
      ) VALUES (
        v_company_id,
        v_driver_id,
        v_driver_id,
        'order_ready',
        'order_ready',
        '🔔 Order Ready for Pickup!',
        format('Order %s for %s is ready. Pickup location: %s', 
          v_order_number, 
          v_client_name, 
          v_venue_address
        ),
        '/team-portal/driver/routes',
        'urgent',
        'driver',
        false,
        NOW()
      );
      
      RAISE NOTICE 'Driver notification created for order % - Driver: %', 
        v_order_number, v_driver_name;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_notify_driver_order_ready ON orders;

-- Create trigger on orders table
CREATE TRIGGER trigger_notify_driver_order_ready
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_driver_order_ready();