-- Create function to send order status email
CREATE OR REPLACE FUNCTION send_order_status_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_email TEXT;
  v_client_name TEXT;
  v_company_id UUID;
  v_order_number TEXT;
  v_event_date TEXT;
  v_status_text TEXT;
  v_email_enabled BOOLEAN;
BEGIN
  -- Only proceed if status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get order details
  SELECT 
    NEW.client_email,
    NEW.client_name,
    NEW.company_id,
    NEW.order_number,
    TO_CHAR(NEW.event_date, 'DD Mon YYYY'),
    CASE NEW.status
      WHEN 'confirmed' THEN 'confirmed'
      WHEN 'preparing' THEN 'being prepared'
      WHEN 'ready' THEN 'ready for pickup'
      WHEN 'out_for_delivery' THEN 'out for delivery'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE NEW.status
    END
  INTO v_client_email, v_client_name, v_company_id, v_order_number, v_event_date, v_status_text;

  -- Check if client has email notifications enabled
  SELECT 
    CASE 
      WHEN NEW.status = 'confirmed' THEN COALESCE(order_confirmed, true)
      WHEN NEW.status = 'ready' THEN COALESCE(order_ready_for_pickup, true)
      WHEN NEW.status = 'delivered' THEN COALESCE(order_delivered, true)
      WHEN NEW.status = 'cancelled' THEN COALESCE(order_cancelled, true)
      ELSE COALESCE(order_status_changed, true)
    END INTO v_email_enabled
  FROM email_notification_preferences enp
  JOIN profiles p ON enp.user_id = p.id
  WHERE p.email = v_client_email;

  -- If no preferences found, default to enabled
  IF v_email_enabled IS NULL THEN
    v_email_enabled := true;
  END IF;

  -- Only send if enabled
  IF v_email_enabled THEN
    -- Insert into email queue (we'll process this via Edge Function or API)
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
      'order_status_' || NEW.status,
      v_client_email,
      v_client_name,
      'Order ' || v_order_number || ' - Status Update: ' || INITCAP(v_status_text),
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for order status changes
DROP TRIGGER IF EXISTS trigger_send_order_status_email ON orders;
CREATE TRIGGER trigger_send_order_status_email
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION send_order_status_email();