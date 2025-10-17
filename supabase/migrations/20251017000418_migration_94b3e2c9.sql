-- ============================================
-- PHASE 2: TRIAL EXPIRY NOTIFICATION SYSTEM
-- ============================================

-- 1. Create trial_expiry_notifications table
CREATE TABLE IF NOT EXISTS trial_expiry_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('7_days', '3_days', '1_day', 'expired')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  days_remaining INTEGER NOT NULL,
  notification_method TEXT DEFAULT 'email' CHECK (notification_method IN ('email', 'dashboard', 'both')),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  dashboard_seen BOOLEAN DEFAULT false,
  dashboard_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_trial_notifications_company ON trial_expiry_notifications(company_id);
CREATE INDEX idx_trial_notifications_type ON trial_expiry_notifications(notification_type);
CREATE INDEX idx_trial_notifications_sent ON trial_expiry_notifications(sent_at);

-- 2. RLS Policies for trial notifications
ALTER TABLE trial_expiry_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_owners_view_trial_notifications"
  ON trial_expiry_notifications FOR SELECT
  USING (
    company_id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND active_role IN ('admin', 'owner')
    )
  );

CREATE POLICY "system_insert_trial_notifications"
  ON trial_expiry_notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "company_owners_update_trial_notifications"
  ON trial_expiry_notifications FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id 
      FROM profiles 
      WHERE id = auth.uid() 
      AND active_role IN ('admin', 'owner')
    )
  );

-- 3. Create function to check and send trial expiry notifications
CREATE OR REPLACE FUNCTION check_trial_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  company_record RECORD;
  days_remaining INTEGER;
  notification_type TEXT;
BEGIN
  -- Loop through all companies with active trials
  FOR company_record IN
    SELECT 
      id,
      name,
      slug,
      owner_id,
      trial_ends_at,
      subscription_status
    FROM companies
    WHERE subscription_status = 'trial'
    AND trial_ends_at IS NOT NULL
    AND is_active = true
  LOOP
    -- Calculate days remaining
    days_remaining := EXTRACT(DAY FROM (company_record.trial_ends_at - NOW()));
    
    -- Determine notification type
    notification_type := NULL;
    
    IF days_remaining <= 0 THEN
      notification_type := 'expired';
    ELSIF days_remaining <= 1 THEN
      notification_type := '1_day';
    ELSIF days_remaining <= 3 THEN
      notification_type := '3_days';
    ELSIF days_remaining <= 7 THEN
      notification_type := '7_days';
    END IF;
    
    -- Only proceed if notification needed
    IF notification_type IS NOT NULL THEN
      -- Check if this notification was already sent
      IF NOT EXISTS (
        SELECT 1 
        FROM trial_expiry_notifications
        WHERE company_id = company_record.id
        AND notification_type = notification_type
        AND sent_at > NOW() - INTERVAL '1 day'
      ) THEN
        -- Insert notification record
        INSERT INTO trial_expiry_notifications (
          company_id,
          notification_type,
          trial_ends_at,
          days_remaining,
          notification_method
        ) VALUES (
          company_record.id,
          notification_type,
          company_record.trial_ends_at,
          days_remaining,
          'both'
        );
        
        -- Create dashboard notification for company owner
        INSERT INTO notifications (
          user_id,
          recipient_id,
          notification_type,
          title,
          message,
          link,
          priority,
          company_id
        )
        SELECT
          company_record.owner_id,
          company_record.owner_id,
          'trial_expiry',
          CASE notification_type
            WHEN 'expired' THEN '🚨 Trial Expired'
            WHEN '1_day' THEN '⏰ Trial Expires Tomorrow'
            WHEN '3_days' THEN '⏰ Trial Expires in 3 Days'
            WHEN '7_days' THEN '📅 Trial Expires in 7 Days'
          END,
          CASE notification_type
            WHEN 'expired' THEN 'Your trial has expired. Subscribe now to continue using CateringMS.'
            WHEN '1_day' THEN 'Your trial expires tomorrow. Subscribe now to avoid interruption.'
            WHEN '3_days' THEN 'Your trial expires in 3 days. Choose a plan to continue.'
            WHEN '7_days' THEN 'Your trial expires in 7 days. Review our subscription plans.'
          END,
          '/' || company_record.slug || '/admin/subscription',
          CASE notification_type
            WHEN 'expired' THEN 'urgent'
            WHEN '1_day' THEN 'high'
            ELSE 'normal'
          END,
          company_record.id
        WHERE company_record.owner_id IS NOT NULL;
        
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 4. Add comment explaining the function
COMMENT ON FUNCTION check_trial_expiry_notifications() IS 
'Checks all trial companies and creates notifications at 7, 3, 1 days before expiry and on expiry. Run this daily via cron job or Edge Function.';