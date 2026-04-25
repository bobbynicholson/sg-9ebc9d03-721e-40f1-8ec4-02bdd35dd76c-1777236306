DO $$ 
BEGIN
  -- quotes
  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);
  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_id uuid;
  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS menu_items jsonb;
  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS equipment_items jsonb;
  ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tax numeric;

  -- leads
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id uuid;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget numeric;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_range text;

  -- orders
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES profiles(id);

  -- deliveries
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS actual_delivery_time timestamptz;
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS driver_notes text;

  -- driver_replacements
  ALTER TABLE driver_replacements ADD COLUMN IF NOT EXISTS accepted_by_driver_id uuid REFERENCES profiles(id);

  -- driver_assignments
  ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS departure_confirmed boolean;
  ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS waiter_earnings numeric;
  ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS calculated_distance numeric;

  -- payments
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method text;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_reference text;

  -- financial_predictions
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS company_id uuid;
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS prediction_date date;
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS predicted_revenue numeric;
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS predicted_expenses numeric;
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS predicted_cashflow numeric;
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS confidence_score numeric;
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS risk_level text;
  ALTER TABLE financial_predictions ADD COLUMN IF NOT EXISTS recommendations jsonb;

  -- blog_posts
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author text;
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS published_date timestamptz;
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS last_updated timestamptz;
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category text;
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS tags text[];

  -- cms_pages
  ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS last_updated timestamptz;

  -- companies
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency text;
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_plan text;

  -- equipment_shortage_flags
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS shortage_reason text;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS financial_impact numeric;
  ALTER TABLE equipment_shortage_flags ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);

  -- equipment
  ALTER TABLE equipment ADD COLUMN IF NOT EXISTS replacement_cost numeric;
  ALTER TABLE equipment ADD COLUMN IF NOT EXISTS cleaning_time_hours numeric;

  -- equipment_handovers
  ALTER TABLE equipment_handovers ADD COLUMN IF NOT EXISTS order_id uuid;
  ALTER TABLE equipment_handovers ADD COLUMN IF NOT EXISTS received_by_user_id uuid REFERENCES profiles(id);

  -- equipment_damages
  ALTER TABLE equipment_damages ADD COLUMN IF NOT EXISTS order_id uuid;

  -- kitchen_duty_shifts
  ALTER TABLE kitchen_duty_shifts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);

  -- kitchen_task_completions
  ALTER TABLE kitchen_task_completions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);

  -- gamification_points
  ALTER TABLE gamification_points ADD COLUMN IF NOT EXISTS awarded_at timestamptz;

  -- gamification_achievements
  ALTER TABLE gamification_achievements ADD COLUMN IF NOT EXISTS unlocked_at timestamptz;

  -- notifications
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_role text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);

  -- inventory
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS active boolean;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url text;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost_per_unit numeric;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS item_name text;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS allergen_info jsonb;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS base_price numeric;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS dietary_tags text[];
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_available boolean;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS requires_advance_notice_hours numeric;

  -- menu_items
  ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS active boolean;
  ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS base_servings numeric;
  ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cook_time_minutes numeric;
  ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS instructions text;
  ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS prep_time_minutes numeric;
  ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS recipe_name text;

  -- suppliers
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS active boolean;
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS emergency_contact text;

  -- payment_schedules
  ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS deposit_paid boolean;
  ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS balance_paid boolean;
  ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
  ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS deposit_transaction_id text;
  ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS balance_paid_at timestamptz;
  ALTER TABLE payment_schedules ADD COLUMN IF NOT EXISTS balance_transaction_id text;

  -- subscriptions
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS new_amount numeric;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancellation_feedback text;
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS dashboard_seen boolean;

  -- support_tickets
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);

  -- time_clock_entries
  ALTER TABLE time_clock_entries ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);
  ALTER TABLE time_clock_entries ADD COLUMN IF NOT EXISTS clock_in_time timestamptz;
  ALTER TABLE time_clock_entries ADD COLUMN IF NOT EXISTS hourly_rate numeric;
  
  -- staff_payment_ledger
  ALTER TABLE staff_payment_ledger ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id);
  ALTER TABLE staff_payment_ledger ADD COLUMN IF NOT EXISTS clock_in_time timestamptz;
  ALTER TABLE staff_payment_ledger ADD COLUMN IF NOT EXISTS hourly_rate numeric;

  -- whatsapp_templates
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS template_name text;
  ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS description text;
  
  -- recipe_scaling_history
  ALTER TABLE recipe_scaling_history ADD COLUMN IF NOT EXISTS original_guest_count numeric;

  -- email_settings
  ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;
  ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS provider text;
  ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS from_name text;
  ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS from_email text;

EXCEPTION WHEN others THEN NULL;
END $$;

-- Fix deliveries foreign key explicitly if missing
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'deliveries_order_id_fkey') THEN
    ALTER TABLE deliveries ADD CONSTRAINT deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Notify PostgREST to reload schema cache so the new tables appear in the auto-generated types
NOTIFY pgrst, 'reload schema';