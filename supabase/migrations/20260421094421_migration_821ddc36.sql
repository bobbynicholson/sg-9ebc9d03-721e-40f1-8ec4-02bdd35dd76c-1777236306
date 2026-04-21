-- Drop existing types and tables if they exist
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS subscription_status CASCADE;
DROP TYPE IF EXISTS lead_status CASCADE;
DROP TYPE IF EXISTS quote_status CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS assignment_status CASCADE;
DROP TYPE IF EXISTS duty_shift CASCADE;
DROP TYPE IF EXISTS equipment_condition CASCADE;
DROP TYPE IF EXISTS cleaning_status CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS notification_channel CASCADE;
DROP TYPE IF EXISTS transaction_type CASCADE;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create ENUMs
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'company_admin',
  'kitchen_staff',
  'driver',
  'shopping_staff',
  'cleaning_staff',
  'client'
);

CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active',
  'past_due',
  'cancelled',
  'suspended'
);

CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'quoted',
  'negotiating',
  'won',
  'lost'
);

CREATE TYPE quote_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'expired'
);

CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'prep',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled'
);

CREATE TYPE assignment_status AS ENUM (
  'assigned',
  'accepted',
  'en_route',
  'picked_up',
  'at_venue',
  'delivered',
  'completed'
);

CREATE TYPE duty_shift AS ENUM (
  'morning',
  'afternoon',
  'evening',
  'overnight'
);

CREATE TYPE equipment_condition AS ENUM (
  'excellent',
  'good',
  'fair',
  'poor',
  'broken',
  'under_repair'
);

CREATE TYPE cleaning_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'skipped'
);

CREATE TYPE payment_method AS ENUM (
  'cash',
  'eft',
  'card',
  'credit_account'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'disputed'
);

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'paid',
  'partially_paid',
  'overdue',
  'written_off'
);

CREATE TYPE notification_type AS ENUM (
  'order_confirmed',
  'order_ready',
  'driver_assigned',
  'out_for_delivery',
  'delivered',
  'payment_received',
  'payment_reminder',
  'driver_replacement_needed',
  'equipment_shortage',
  'stock_low',
  'quote_expiring',
  'trial_expiring',
  'subscription_renewed'
);

CREATE TYPE notification_channel AS ENUM (
  'email',
  'sms',
  'whatsapp',
  'push',
  'in_app'
);

CREATE TYPE transaction_type AS ENUM (
  'purchase',
  'usage',
  'waste',
  'adjustment',
  'transfer',
  'return'
);