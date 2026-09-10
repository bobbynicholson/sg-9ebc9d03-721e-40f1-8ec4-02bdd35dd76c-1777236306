-- Create email notification preferences table
CREATE TABLE IF NOT EXISTS email_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Order notifications
  order_confirmed BOOLEAN DEFAULT true,
  order_status_changed BOOLEAN DEFAULT true,
  order_ready_for_pickup BOOLEAN DEFAULT true,
  order_delivered BOOLEAN DEFAULT true,
  order_cancelled BOOLEAN DEFAULT true,
  
  -- Assignment notifications
  driver_assigned BOOLEAN DEFAULT true,
  task_assigned BOOLEAN DEFAULT true,
  
  -- Payment notifications
  payment_received BOOLEAN DEFAULT true,
  payment_due BOOLEAN DEFAULT true,
  invoice_sent BOOLEAN DEFAULT true,
  
  -- Inventory notifications
  low_stock_alert BOOLEAN DEFAULT true,
  out_of_stock_alert BOOLEAN DEFAULT true,
  
  -- System notifications
  daily_summary BOOLEAN DEFAULT false,
  weekly_report BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_prefs_user 
  ON email_notification_preferences(user_id);

-- Enable RLS
ALTER TABLE email_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own preferences" ON email_notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON email_notification_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON email_notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);