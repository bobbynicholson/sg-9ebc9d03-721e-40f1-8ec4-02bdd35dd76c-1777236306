-- Equipment tracking for operational standards 41-75

-- PAT Testing (Electrical Safety) #43
CREATE TABLE IF NOT EXISTS pat_testing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  test_date DATE NOT NULL,
  next_test_date DATE NOT NULL,
  tester_name TEXT,
  certificate_number TEXT,
  test_result TEXT CHECK (test_result IN ('pass', 'fail', 'advisory')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backup Generators #44
CREATE TABLE IF NOT EXISTS backup_generators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT,
  capacity_kw NUMERIC(10, 2),
  fuel_type TEXT,
  location TEXT,
  last_service_date DATE,
  next_service_date DATE,
  auto_start_enabled BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'operational' CHECK (status IN ('operational', 'maintenance', 'faulty')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cooking Fuel Stockpile #46
CREATE TABLE IF NOT EXISTS fuel_stockpile (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('gas_cylinder', 'propane', 'butane', 'diesel', 'other')),
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'cylinders',
  location TEXT,
  minimum_stock_level INTEGER DEFAULT 2,
  last_restock_date DATE,
  supplier_id UUID REFERENCES suppliers(id),
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Serving Utensils QR Tracking #47
CREATE TABLE IF NOT EXISTS utensil_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  utensil_type TEXT NOT NULL,
  qr_code TEXT UNIQUE NOT NULL,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'checked_out', 'in_use', 'returned', 'lost', 'damaged')),
  checked_out_by UUID REFERENCES profiles(id),
  checked_out_at TIMESTAMP WITH TIME ZONE,
  checked_in_at TIMESTAMP WITH TIME ZONE,
  event_id UUID REFERENCES orders(id),
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Linen Management #49
CREATE TABLE IF NOT EXISTS linen_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('tablecloth', 'napkin', 'runner', 'chair_cover', 'apron', 'other')),
  color TEXT,
  size TEXT,
  quantity_total INTEGER NOT NULL,
  quantity_clean INTEGER DEFAULT 0,
  quantity_dirty INTEGER DEFAULT 0,
  quantity_in_laundry INTEGER DEFAULT 0,
  laundry_cycle_days INTEGER DEFAULT 2,
  last_laundry_date DATE,
  next_laundry_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dishwasher Cycle Planning #50
CREATE TABLE IF NOT EXISTS dishwasher_cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  machine_name TEXT NOT NULL,
  cycle_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  cycle_end_time TIMESTAMP WITH TIME ZONE,
  cycle_duration_minutes INTEGER DEFAULT 20,
  load_type TEXT CHECK (load_type IN ('cutlery', 'plates', 'glassware', 'pots_pans', 'mixed')),
  completed BOOLEAN DEFAULT false,
  operator_id UUID REFERENCES profiles(id),
  temperature_celsius NUMERIC(5, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Glassware Categorization #51
CREATE TABLE IF NOT EXISTS glassware_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  glass_type TEXT NOT NULL,
  style_name TEXT,
  capacity_ml INTEGER,
  photo_url TEXT,
  quantity_owned INTEGER DEFAULT 0,
  quantity_available INTEGER DEFAULT 0,
  suitable_for TEXT[], -- Array of drink types
  minimum_stock_level INTEGER DEFAULT 50,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Storage Rack Mapping #52
CREATE TABLE IF NOT EXISTS storage_racks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rack_number TEXT NOT NULL,
  zone TEXT NOT NULL,
  shelf_count INTEGER DEFAULT 1,
  current_contents TEXT,
  temperature_controlled BOOLEAN DEFAULT false,
  notes TEXT,
  map_position_x INTEGER, -- For visual mapping
  map_position_y INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, rack_number)
);

-- Cleaning Supplies Auto-Reorder #55
CREATE TABLE IF NOT EXISTS cleaning_supplies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supply_name TEXT NOT NULL,
  category TEXT CHECK (category IN ('sanitizer', 'detergent', 'disinfectant', 'soap', 'other')),
  current_quantity NUMERIC(10, 2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'liters',
  minimum_stock_level NUMERIC(10, 2) NOT NULL,
  reorder_trigger_level NUMERIC(10, 2) NOT NULL,
  auto_reorder_enabled BOOLEAN DEFAULT true,
  supplier_id UUID REFERENCES suppliers(id),
  last_reorder_date DATE,
  cost_per_unit NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pest Control Schedule #56
CREATE TABLE IF NOT EXISTS pest_control_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  next_inspection_date DATE NOT NULL,
  inspector_name TEXT,
  company_name TEXT,
  certificate_number TEXT,
  areas_inspected TEXT[],
  findings TEXT,
  activity_detected BOOLEAN DEFAULT false,
  treatment_applied BOOLEAN DEFAULT false,
  treatment_details TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  report_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safety Equipment Tracking #57
CREATE TABLE IF NOT EXISTS safety_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('fire_extinguisher', 'fire_blanket', 'first_aid_kit', 'eye_wash', 'other')),
  location TEXT NOT NULL,
  serial_number TEXT,
  installation_date DATE,
  last_inspection_date DATE,
  next_inspection_date DATE NOT NULL,
  expiry_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'needs_service', 'replaced')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lighting Adequacy Tests #58
CREATE TABLE IF NOT EXISTS lighting_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  test_date DATE NOT NULL,
  area_tested TEXT NOT NULL,
  lux_measurement NUMERIC(10, 2) NOT NULL,
  minimum_required_lux NUMERIC(10, 2) DEFAULT 500,
  compliant BOOLEAN GENERATED ALWAYS AS (lux_measurement >= minimum_required_lux) STORED,
  tester_name TEXT,
  remedial_action_required BOOLEAN DEFAULT false,
  action_taken TEXT,
  next_test_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Floor Safety Inspections #59
CREATE TABLE IF NOT EXISTS floor_safety_inspections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  area TEXT NOT NULL,
  mat_condition TEXT CHECK (mat_condition IN ('good', 'worn', 'needs_replacement')),
  drainage_working BOOLEAN DEFAULT true,
  slip_risk_level TEXT CHECK (slip_risk_level IN ('low', 'medium', 'high')),
  issues_found TEXT,
  corrective_actions TEXT,
  inspector_id UUID REFERENCES profiles(id),
  photo_urls TEXT[],
  next_inspection_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Delivery Crates Barcode System #60
CREATE TABLE IF NOT EXISTS delivery_crates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  barcode TEXT UNIQUE NOT NULL,
  crate_type TEXT CHECK (crate_type IN ('insulated', 'standard', 'cold', 'hot')),
  capacity_liters NUMERIC(10, 2),
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_transit', 'at_event', 'cleaning', 'damaged')),
  assigned_to_driver UUID REFERENCES profiles(id),
  assigned_to_event UUID REFERENCES orders(id),
  last_cleaned_date DATE,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Load Planning (Hot/Cold Separation) #64
CREATE TABLE IF NOT EXISTS load_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES orders(id),
  vehicle_id UUID REFERENCES vehicles(id),
  created_by UUID REFERENCES profiles(id),
  hot_zone_items TEXT[],
  cold_zone_items TEXT[],
  temperature_requirements TEXT,
  loading_sequence INTEGER[],
  special_instructions TEXT,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ice and Cooling Transport #71
CREATE TABLE IF NOT EXISTS ice_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID REFERENCES orders(id),
  ice_type TEXT CHECK (ice_type IN ('cubed', 'crushed', 'block')),
  quantity_kg NUMERIC(10, 2) NOT NULL,
  departure_condition TEXT CHECK (departure_condition IN ('solid', 'partially_melted', 'liquid')),
  arrival_condition TEXT CHECK (arrival_condition IN ('solid', 'partially_melted', 'liquid')),
  transport_duration_minutes INTEGER,
  cooler_type TEXT,
  temperature_on_arrival_celsius NUMERIC(5, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insurance Tracking #72
CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('vehicle', 'goods_in_transit', 'liability', 'equipment', 'property', 'other')),
  policy_number TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  coverage_amount NUMERIC(15, 2),
  currency TEXT DEFAULT 'ZAR',
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  premium_amount NUMERIC(10, 2),
  premium_frequency TEXT CHECK (premium_frequency IN ('monthly', 'quarterly', 'annually')),
  documents_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Load-off Procedures #73
CREATE TABLE IF NOT EXISTS loadoff_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES orders(id),
  driver_id UUID REFERENCES profiles(id),
  venue_arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
  unloading_sequence_followed BOOLEAN DEFAULT true,
  manifest_verified BOOLEAN DEFAULT false,
  items_damaged TEXT[],
  items_missing TEXT[],
  signature_collected BOOLEAN DEFAULT false,
  signature_image_url TEXT,
  venue_contact_name TEXT,
  venue_contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Return Load Tracking #74
CREATE TABLE IF NOT EXISTS return_load_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES orders(id),
  driver_id UUID REFERENCES profiles(id),
  departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
  arrival_time TIMESTAMP WITH TIME ZONE,
  items_expected TEXT[],
  items_returned TEXT[],
  items_missing TEXT[],
  items_damaged TEXT[],
  scan_verification_complete BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Driver Rest Compliance #75
CREATE TABLE IF NOT EXISTS driver_rest_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id),
  shift_date DATE NOT NULL,
  shift_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  shift_end_time TIMESTAMP WITH TIME ZONE,
  total_driving_hours NUMERIC(5, 2),
  rest_breaks_taken INTEGER DEFAULT 0,
  rest_duration_minutes INTEGER,
  compliant BOOLEAN DEFAULT true,
  violations TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE pat_testing ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_generators ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_stockpile ENABLE ROW LEVEL SECURITY;
ALTER TABLE utensil_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE linen_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE dishwasher_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE glassware_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_control_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE lighting_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_safety_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ice_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE loadoff_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_load_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_rest_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for company isolation
CREATE POLICY "Company access only" ON pat_testing FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON backup_generators FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON fuel_stockpile FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON utensil_tracking FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON linen_inventory FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON dishwasher_cycles FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON glassware_catalog FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON storage_racks FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON cleaning_supplies FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON pest_control_logs FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON safety_equipment FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON lighting_tests FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON floor_safety_inspections FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON delivery_crates FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON load_plans FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON ice_tracking FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON insurance_policies FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON loadoff_verifications FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON return_load_tracking FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Company access only" ON driver_rest_logs FOR ALL USING (
  company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);