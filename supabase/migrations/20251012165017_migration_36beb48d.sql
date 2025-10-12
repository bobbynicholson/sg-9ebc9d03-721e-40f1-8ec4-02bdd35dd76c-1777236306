-- Create subscriptions table with comprehensive fields
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  
  -- Pricing information
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  
  -- Trial information
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  trial_days INTEGER DEFAULT 14,
  
  -- Billing dates
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  next_billing_date TIMESTAMP WITH TIME ZONE,
  
  -- Cancellation information
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  cancellation_feedback TEXT,
  
  -- Price change management
  pending_price_change BOOLEAN DEFAULT FALSE,
  new_amount DECIMAL(10,2),
  price_change_effective_date TIMESTAMP WITH TIME ZONE,
  price_change_notification_sent BOOLEAN DEFAULT FALSE,
  
  -- Usage tracking
  active_clients_count INTEGER DEFAULT 0,
  orders_this_quarter INTEGER DEFAULT 0,
  quarter_start_date TIMESTAMP WITH TIME ZONE,
  
  -- Payment gateway info
  payfast_token TEXT,
  payment_method_last4 TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create billing_history table
CREATE TABLE IF NOT EXISTS billing_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  
  -- Payment details
  payment_method TEXT,
  transaction_id TEXT,
  payfast_payment_id TEXT,
  
  -- Invoice details
  invoice_number TEXT,
  invoice_pdf_url TEXT,
  
  billing_period_start TIMESTAMP WITH TIME ZONE,
  billing_period_end TIMESTAMP WITH TIME ZONE,
  
  paid_at TIMESTAMP WITH TIME ZONE,
  failed_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create price_changes table
CREATE TABLE IF NOT EXISTS price_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What changed
  plan_id TEXT NOT NULL,
  old_amount DECIMAL(10,2) NOT NULL,
  new_amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  
  -- When it changes
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
  announced_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Reason for change
  change_reason TEXT NOT NULL,
  exchange_rate_info TEXT,
  
  -- Notification tracking
  notifications_sent BOOLEAN DEFAULT FALSE,
  affected_subscriptions_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cancellation_requests table
CREATE TABLE IF NOT EXISTS cancellation_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  cancellation_type TEXT NOT NULL CHECK (cancellation_type IN ('immediate', 'end_of_period')),
  reason TEXT,
  feedback TEXT,
  
  -- Retention attempt
  retention_offer_made BOOLEAN DEFAULT FALSE,
  retention_offer_accepted BOOLEAN DEFAULT FALSE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed')),
  processed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create account_deletion_requests table (GDPR/POPIA compliance)
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  reason TEXT,
  data_export_requested BOOLEAN DEFAULT FALSE,
  data_export_url TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  
  -- Grace period (30 days to change mind)
  scheduled_deletion_date TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscription" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscription" ON subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for billing_history
CREATE POLICY "Users can view their own billing history" ON billing_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert billing records" ON billing_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for price_changes
CREATE POLICY "Anyone can view price changes" ON price_changes FOR SELECT USING (true);
CREATE POLICY "Only admins can manage price changes" ON price_changes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- RLS Policies for cancellation_requests
CREATE POLICY "Users can view their own cancellation requests" ON cancellation_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create cancellation requests" ON cancellation_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for account_deletion_requests
CREATE POLICY "Users can view their own deletion requests" ON account_deletion_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create deletion requests" ON account_deletion_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_billing_history_user_id ON billing_history(user_id);
CREATE INDEX idx_billing_history_subscription_id ON billing_history(subscription_id);
CREATE INDEX idx_price_changes_effective_date ON price_changes(effective_date);