-- Create function to send driver assignment email
CREATE OR REPLACE FUNCTION send_driver_assignment_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_driver_email TEXT;
  v_driver_name TEXT;
  v_order_number TEXT;
  v_client_name TEXT;
  v_event_date TEXT;
  v_company_id UUID;
  v_email_enabled BOOLEAN;
BEGIN
  -- Only proceed if driver assignment changed
  IF OLD.driver_id = NEW.driver_id AND OLD.assigned_driver_id = NEW.assigned_driver_id THEN
    RETURN NEW;
  END IF;

  -- Get driver details (check both driver_id and assigned_driver_id)
  SELECT 
    p.email,
    p.full_name,
    NEW.order_number,
    NEW.client_name,
    TO_CHAR(NEW.event_date, 'DD Mon YYYY at HH24:MI'),
    NEW.company_id
  INTO v_driver_email, v_driver_name, v_order_number, v_client_name, v_event_date, v_company_id
  FROM profiles p
  WHERE p.id = COALESCE(NEW.driver_id, NEW.assigned_driver_id);

  -- Skip if no driver assigned
  IF v_driver_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if driver has email notifications enabled
  SELECT COALESCE(driver_assigned, true) INTO v_email_enabled
  FROM email_notification_preferences
  WHERE user_id = COALESCE(NEW.driver_id, NEW.assigned_driver_id);

  -- If no preferences found, default to enabled
  IF v_email_enabled IS NULL THEN
    v_email_enabled := true;
  END IF;

  -- Only send if enabled
  IF v_email_enabled THEN
    -- Insert into email queue
    INSERT INTO email_automation_log (
      user_id,
      order_id,
      template_type,
      recipient_email,
      recipient_name,
      subject,
      status
    ) VALUES (
      v_company_id,
      NEW.id,
      'driver_assigned',
      v_driver_email,
      v_driver_name,
      'New Delivery Assignment - ' || v_order_number,
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for driver assignments
DROP TRIGGER IF EXISTS trigger_send_driver_assignment_email ON orders;
CREATE TRIGGER trigger_send_driver_assignment_email
  AFTER UPDATE OF driver_id, assigned_driver_id ON orders
  FOR EACH ROW
  EXECUTE FUNCTION send_driver_assignment_email();