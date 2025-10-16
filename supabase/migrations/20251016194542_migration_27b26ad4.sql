-- ==========================================
-- CATERING OPERATIONS MANAGEMENT SYSTEM
-- Comprehensive database schema for all 40 operational standards
-- ==========================================

-- 1. MENU PLANNING & RECIPES
-- ==========================================

-- Menu items with cost tracking
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- starter, main, dessert, beverage
  base_cost DECIMAL(10,2), -- cost to produce
  selling_price DECIMAL(10,2),
  profit_margin DECIMAL(5,2), -- calculated percentage
  prep_time_minutes INTEGER, -- time to prepare
  serves INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Standardized recipes (#2)
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  prep_steps JSONB, -- Array of step-by-step instructions
  cooking_steps JSONB,
  plating_notes TEXT,
  batch_size INTEGER DEFAULT 1, -- for batch cooking (#3)
  cook_time_minutes INTEGER,
  holding_temp_celsius DECIMAL(4,1), -- safe holding temperature
  shelf_life_hours INTEGER, -- how long it stays fresh
  active BOOLEAN DEFAULT true,
  locked BOOLEAN DEFAULT false, -- prevent changes (#2)
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipe ingredients (links recipes to inventory)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL, -- kg, g, ml, l, pieces
  cost_per_unit DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Allergen register (#9)
CREATE TABLE IF NOT EXISTS allergens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL, -- milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame
  icon_name TEXT, -- for UI display
  severity TEXT DEFAULT 'high', -- high, medium, low
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert standard allergens
INSERT INTO allergens (name, icon_name, severity) VALUES
  ('Milk & Dairy', 'milk', 'high'),
  ('Eggs', 'egg', 'high'),
  ('Fish', 'fish', 'high'),
  ('Shellfish', 'shell', 'high'),
  ('Tree Nuts', 'nut', 'high'),
  ('Peanuts', 'peanut', 'high'),
  ('Wheat & Gluten', 'wheat', 'high'),
  ('Soybeans', 'bean', 'medium'),
  ('Sesame', 'sesame', 'medium'),
  ('Celery', 'leaf', 'low'),
  ('Mustard', 'mustard', 'low'),
  ('Sulphites', 'chemistry', 'low')
ON CONFLICT (name) DO NOTHING;

-- Recipe allergens (many-to-many)
CREATE TABLE IF NOT EXISTS recipe_allergens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  allergen_id UUID NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
  notes TEXT, -- e.g., "contains traces", "may contain"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(recipe_id, allergen_id)
);

-- 2. ADVANCED INVENTORY MANAGEMENT
-- ==========================================

-- FIFO inventory tracking (#8)
CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  batch_code TEXT NOT NULL, -- user-generated label (#8)
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  received_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  use_by_date DATE, -- different from expiry
  storage_location TEXT, -- fridge_1, freezer_2, dry_shelf_a
  storage_temp_celsius DECIMAL(4,1), -- actual temperature
  supplier_name TEXT,
  cost_per_unit DECIMAL(10,2),
  status TEXT DEFAULT 'available', -- available, in_use, expired, wasted
  preparer_initials TEXT, -- who prepped it (#10)
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Storage locations (#6, #7)
CREATE TABLE IF NOT EXISTS storage_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- cold, freezer, dry
  capacity_liters DECIMAL(10,2),
  current_usage_liters DECIMAL(10,2) DEFAULT 0,
  min_temp_celsius DECIMAL(4,1), -- e.g., 0 for cold storage
  max_temp_celsius DECIMAL(4,1), -- e.g., 5 for cold storage
  location_notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Temperature logs (#17)
CREATE TABLE IF NOT EXISTS temperature_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_location_id UUID REFERENCES storage_locations(id) ON DELETE CASCADE,
  recorded_temp_celsius DECIMAL(4,1) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recorded_by UUID REFERENCES profiles(id),
  alert_triggered BOOLEAN DEFAULT false, -- if temp outside range
  notes TEXT
);

-- Ingredient substitutions (#18)
CREATE TABLE IF NOT EXISTS ingredient_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_ingredient TEXT NOT NULL,
  substitute_ingredient TEXT NOT NULL,
  ratio TEXT, -- e.g., "1:1", "use 50% more"
  cost_impact DECIMAL(10,2), -- positive or negative
  allergen_impact TEXT, -- what allergens are added/removed
  taste_impact TEXT, -- minimal, noticeable, significant
  tested BOOLEAN DEFAULT false,
  approved BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waste tracking (#16)
CREATE TABLE IF NOT EXISTS waste_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL, -- expired, spoiled, over-prep, spillage, damaged
  cost_value DECIMAL(10,2),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  logged_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. SUPPLIER MANAGEMENT
-- ==========================================

-- Suppliers (#4, #19)
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT, -- produce, meat, dairy, dry goods
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  priority INTEGER DEFAULT 2, -- 1=primary, 2=secondary, 3=emergency
  delivery_days TEXT, -- JSON array of days
  lead_time_hours INTEGER, -- how much notice needed
  minimum_order DECIMAL(10,2),
  rating DECIMAL(2,1), -- 1-5 star rating
  reliability_score INTEGER, -- 0-100
  quality_score INTEGER, -- 0-100
  active BOOLEAN DEFAULT true,
  emergency_contact BOOLEAN DEFAULT false, -- for #19
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supplier products with pricing
CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL,
  price_per_unit DECIMAL(10,2) NOT NULL,
  minimum_order_quantity DECIMAL(10,2),
  traceability_cert TEXT, -- certification number (#4)
  active BOOLEAN DEFAULT true,
  last_price_update DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. EQUIPMENT MANAGEMENT
-- ==========================================

-- Equipment maintenance (#13, #14)
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  equipment_type TEXT, -- oven, fridge, freezer, hotplate, mixer
  serial_number TEXT,
  is_backup BOOLEAN DEFAULT false, -- backup equipment (#14)
  maintenance_frequency_days INTEGER DEFAULT 90, -- quarterly
  last_service_date DATE,
  next_service_date DATE,
  service_provider TEXT,
  service_cost DECIMAL(10,2),
  status TEXT DEFAULT 'operational', -- operational, needs_service, broken, backup
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Equipment maintenance history
CREATE TABLE IF NOT EXISTS equipment_service_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment_maintenance(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type TEXT, -- routine, repair, emergency, safety_check
  technician_name TEXT,
  cost DECIMAL(10,2),
  issues_found TEXT,
  actions_taken TEXT,
  next_service_due DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safety checks (#15)
CREATE TABLE IF NOT EXISTS safety_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL, -- gas, electrical, fire, structural
  check_date DATE NOT NULL,
  inspector_name TEXT,
  certification_number TEXT,
  expiry_date DATE,
  passed BOOLEAN NOT NULL,
  issues_found TEXT,
  actions_required TEXT,
  next_check_due DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_menu_items_company ON menu_items(company_id);
CREATE INDEX idx_recipes_company ON recipes(company_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_inventory_batches_company_expiry ON inventory_batches(company_id, expiry_date);
CREATE INDEX idx_inventory_batches_status ON inventory_batches(status);
CREATE INDEX idx_temperature_logs_location_date ON temperature_logs(storage_location_id, recorded_at DESC);
CREATE INDEX idx_waste_logs_company_date ON waste_logs(company_id, date DESC);
CREATE INDEX idx_suppliers_company ON suppliers(company_id);
CREATE INDEX idx_equipment_maintenance_company ON equipment_maintenance(company_id);

-- Enable RLS
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE temperature_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (company-scoped)
CREATE POLICY "Users can view their company menu items" ON menu_items FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company menu items" ON menu_items FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their company recipes" ON recipes FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company recipes" ON recipes FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Anyone can view allergens" ON allergens FOR SELECT USING (true);

CREATE POLICY "Users can view their company inventory" ON inventory_batches FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company inventory" ON inventory_batches FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their company suppliers" ON suppliers FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company suppliers" ON suppliers FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their company equipment" ON equipment_maintenance FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage their company equipment" ON equipment_maintenance FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));