-- =====================================================
-- COMPREHENSIVE SCHEMA FIX MIGRATION - Part 2
-- Create missing tables
-- =====================================================

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  status text NOT NULL DEFAULT 'trial',
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  trial_ends_at timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT subscriptions_status_check CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Create billing_history table
CREATE TABLE IF NOT EXISTS billing_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL,
  invoice_url text,
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_history_status_check CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_billing_history_user ON billing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_subscription ON billing_history(subscription_id);

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  template_type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_company ON email_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);

-- Create email_automation_log table
CREATE TABLE IF NOT EXISTS email_automation_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  template_type text NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  status text NOT NULL,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_automation_log_order ON email_automation_log(order_id);
CREATE INDEX IF NOT EXISTS idx_email_automation_log_user ON email_automation_log(user_id);

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  category text,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);