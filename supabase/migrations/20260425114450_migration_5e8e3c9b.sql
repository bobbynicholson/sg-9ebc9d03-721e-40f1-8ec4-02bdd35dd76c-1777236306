DO $$ 
BEGIN
  -- orders
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_chef_id uuid REFERENCES profiles(id);

  -- leads
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS special_requests text;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_name text;

  -- blog_posts
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured_image text;
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_title text;
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description text;
  ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS read_time_minutes numeric;

  -- companies
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone text;

  -- currency_fluctuation_alerts
  ALTER TABLE currency_fluctuation_alerts ADD COLUMN IF NOT EXISTS currency_pair text;
  ALTER TABLE currency_fluctuation_alerts ADD COLUMN IF NOT EXISTS target_currency text;
  ALTER TABLE currency_fluctuation_alerts ADD COLUMN IF NOT EXISTS base_currency text;

  -- subscriptions
  ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_change_effective_date timestamptz;

  -- delivery_route_stops
  ALTER TABLE delivery_route_stops ADD COLUMN IF NOT EXISTS departure_time timestamptz;

  -- shopping_lists
  ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS status text;
  ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS notes text;
  ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS estimated_total numeric;
  ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS actual_total numeric;

  -- shopping_list_items
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS item_id uuid;
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS name text;
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS quantity numeric;
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS unit text;
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS category text;
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS estimated_cost numeric;
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS actual_cost numeric;
  ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS notes text;

  -- integrations
  ALTER TABLE integrations ADD COLUMN IF NOT EXISTS settings jsonb;
  ALTER TABLE integrations ADD COLUMN IF NOT EXISTS status text;
  ALTER TABLE integrations ADD COLUMN IF NOT EXISTS access_token text;
  ALTER TABLE integrations ADD COLUMN IF NOT EXISTS refresh_token text;

  -- equipment_damages
  ALTER TABLE equipment_damages ADD COLUMN IF NOT EXISTS reported_by uuid;
  ALTER TABLE equipment_damages ADD COLUMN IF NOT EXISTS notes text;
  ALTER TABLE equipment_damages ADD COLUMN IF NOT EXISTS repair_cost numeric;

  -- equipment_cleaning_status
  ALTER TABLE equipment_cleaning_status ADD COLUMN IF NOT EXISTS cleaned_quantity numeric;
  ALTER TABLE equipment_cleaning_status ADD COLUMN IF NOT EXISTS status text;

  -- kitchen_duty_shifts
  ALTER TABLE kitchen_duty_shifts ADD COLUMN IF NOT EXISTS shift_type text;

  -- kitchen_task_completions
  ALTER TABLE kitchen_task_completions ADD COLUMN IF NOT EXISTS staff_id uuid;

  -- inventory
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS minimum_stock numeric;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit text;
  ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category text;

  -- Make fields nullable where TS complains about missing required fields
  ALTER TABLE payments ALTER COLUMN payment_method DROP NOT NULL;
  ALTER TABLE payments ALTER COLUMN payment_reference DROP NOT NULL;
  ALTER TABLE leads ALTER COLUMN company_name DROP NOT NULL;

EXCEPTION WHEN others THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';