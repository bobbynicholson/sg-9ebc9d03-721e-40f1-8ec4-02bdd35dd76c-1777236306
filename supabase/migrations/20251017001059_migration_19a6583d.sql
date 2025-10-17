-- ==================== TRIAL EXPIRY NOTIFICATION AUTOMATION ====================
-- This function checks for companies approaching trial expiry and creates notifications

CREATE OR REPLACE FUNCTION check_trial_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  company_record RECORD;
  days_until_expiry INTEGER;
  notification_type TEXT;
  notification_exists BOOLEAN;
BEGIN
  -- Loop through all companies with trial status
  FOR company_record IN
    SELECT 
      id,
      name,
      owner_id,
      trial_ends_at,
      subscription_status
    FROM companies
    WHERE subscription_status = 'trial'
    AND trial_ends_at IS NOT NULL
  LOOP
    -- Calculate days until expiry
    days_until_expiry := EXTRACT(DAY FROM (company_record.trial_ends_at - NOW()));
    
    -- Determine notification type based on days remaining
    notification_type := NULL;
    
    IF days_until_expiry <= 0 THEN
      notification_type := 'expired';
    ELSIF days_until_expiry = 1 THEN
      notification_type := '1_day';
    ELSIF days_until_expiry = 3 THEN
      notification_type := '3_days';
    ELSIF days_until_expiry = 7 THEN
      notification_type := '7_days';
    END IF;
    
    -- Only proceed if we have a notification type
    IF notification_type IS NOT NULL THEN
      -- Check if this notification has already been sent
      SELECT EXISTS(
        SELECT 1 
        FROM trial_expiry_notifications
        WHERE company_id = company_record.id
        AND notification_type = notification_type
      ) INTO notification_exists;
      
      -- If notification doesn't exist, create it
      IF NOT notification_exists THEN
        INSERT INTO trial_expiry_notifications (
          company_id,
          notification_type,
          trial_ends_at,
          days_remaining,
          notification_method,
          email_sent,
          dashboard_seen
        ) VALUES (
          company_record.id,
          notification_type,
          company_record.trial_ends_at,
          days_until_expiry,
          'email',
          FALSE,
          FALSE
        );
        
        -- Log the notification creation
        RAISE NOTICE 'Created % notification for company: %', notification_type, company_record.name;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_trial_expiry_notifications() TO authenticated;

-- Create a scheduled job comment (for documentation - actual scheduling would be done via pg_cron or external scheduler)
COMMENT ON FUNCTION check_trial_expiry_notifications() IS 
'Checks for companies with expiring trials and creates notifications. Should be run daily via cron job or external scheduler.';

-- ==================== HELPER FUNCTION: GET TRIAL STATUS ====================
-- Function to get comprehensive trial status for a company

CREATE OR REPLACE FUNCTION get_company_trial_status(p_company_id UUID)
RETURNS TABLE (
  is_in_trial BOOLEAN,
  days_remaining INTEGER,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  subscription_status TEXT,
  notifications_sent INTEGER,
  last_notification_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (c.subscription_status = 'trial' AND c.trial_ends_at > NOW()) as is_in_trial,
    GREATEST(0, EXTRACT(DAY FROM (c.trial_ends_at - NOW()))::INTEGER) as days_remaining,
    c.trial_ends_at,
    c.subscription_status,
    (SELECT COUNT(*)::INTEGER FROM trial_expiry_notifications WHERE company_id = p_company_id) as notifications_sent,
    (SELECT notification_type FROM trial_expiry_notifications WHERE company_id = p_company_id ORDER BY sent_at DESC LIMIT 1) as last_notification_type
  FROM companies c
  WHERE c.id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_company_trial_status(UUID) TO authenticated;

-- ==================== TRIGGER: AUTO-UPDATE TRIAL STATUS ====================
-- Automatically update subscription_status when trial expires

CREATE OR REPLACE FUNCTION update_expired_trials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If trial has expired and status is still 'trial', update to 'expired'
  IF NEW.subscription_status = 'trial' 
     AND NEW.trial_ends_at IS NOT NULL 
     AND NEW.trial_ends_at < NOW() THEN
    NEW.subscription_status := 'expired';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on companies table
DROP TRIGGER IF EXISTS trigger_update_expired_trials ON companies;
CREATE TRIGGER trigger_update_expired_trials
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_expired_trials();

-- ==================== INDEX OPTIMIZATION ====================
-- Add indexes to improve trial notification query performance

CREATE INDEX IF NOT EXISTS idx_companies_trial_status 
  ON companies(subscription_status, trial_ends_at) 
  WHERE subscription_status = 'trial';

CREATE INDEX IF NOT EXISTS idx_trial_notifications_company_type 
  ON trial_expiry_notifications(company_id, notification_type);

-- ==================== SUCCESS MESSAGE ====================
DO $$
BEGIN
  RAISE NOTICE '✅ Trial expiry notification system successfully configured!';
  RAISE NOTICE '📊 Functions created: check_trial_expiry_notifications(), get_company_trial_status()';
  RAISE NOTICE '🔔 Trigger created: trigger_update_expired_trials';
  RAISE NOTICE '⚡ Indexes optimized for trial queries';
END $$;