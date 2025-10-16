-- ==========================================
-- STAFF OPERATIONS & DAILY MANAGEMENT
-- ==========================================

-- 5. STAFF TRAINING & CERTIFICATIONS
-- ==========================================

-- Training manuals & SOPs (#31)
CREATE TABLE IF NOT EXISTS training_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL, -- food_safety, equipment_use, customer_service, emergency_procedures
  content TEXT, -- markdown or rich text
  video_url TEXT,
  document_url TEXT,
  required_for_roles TEXT[], -- array of department names
  estimated_duration_minutes INTEGER,
  version INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff training completion tracking
CREATE TABLE IF NOT EXISTS staff_training_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  training_material_id UUID NOT NULL REFERENCES training_materials(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  score DECIMAL(5,2), -- if there's a test
  passed BOOLEAN DEFAULT false,
  certificate_issued BOOLEAN DEFAULT false,
  expiry_date DATE, -- for certifications that expire
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, training_material_id)
);

-- Health certificates (#37)
CREATE TABLE IF NOT EXISTS health_certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  certificate_type TEXT NOT NULL, -- food_handler, first_aid, allergen_awareness
  certificate_number TEXT,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  issuing_authority TEXT,
  document_url TEXT,
  status TEXT DEFAULT 'valid', -- valid, expiring_soon, expired
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cross-training matrix (#32)
CREATE TABLE IF NOT EXISTS staff_skills_matrix (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  department TEXT NOT NULL, -- kitchen, driver, cleaning, shopping
  proficiency_level TEXT NOT NULL, -- beginner, intermediate, advanced, expert
  certified BOOLEAN DEFAULT false,
  last_assessed_date DATE,
  assessed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, skill_name, department)
);

-- Performance reviews (#33)
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  reviewer_id UUID REFERENCES profiles(id),
  attendance_score INTEGER, -- 0-100
  speed_score INTEGER, -- 0-100
  accuracy_score INTEGER, -- 0-100
  teamwork_score INTEGER, -- 0-100
  overall_score INTEGER, -- 0-100
  strengths TEXT,
  areas_for_improvement TEXT,
  goals_for_next_period TEXT,
  bonus_eligible BOOLEAN DEFAULT false,
  bonus_amount DECIMAL(10,2),
  review_date DATE NOT NULL,
  next_review_date DATE,
  status TEXT DEFAULT 'draft', -- draft, completed, acknowledged
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff transport planning (#38)
CREATE TABLE IF NOT EXISTS staff_transport (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_location TEXT,
  pickup_location TEXT,
  pickup_time TIME NOT NULL,
  dropoff_time TIME,
  transport_type TEXT, -- company_shuttle, personal, allowance, uber
  cost DECIMAL(10,2),
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, cancelled
  driver_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency contacts (#35)
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone_primary TEXT NOT NULL,
  phone_secondary TEXT,
  email TEXT,
  address TEXT,
  medical_notes TEXT, -- allergies, conditions, medications
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Employee meal tracking (#36)
CREATE TABLE IF NOT EXISTS employee_meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  meal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT NOT NULL, -- breakfast, lunch, dinner, snack
  cost_per_meal DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Uniform tracking (#28)
CREATE TABLE IF NOT EXISTS uniform_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  item_type TEXT NOT NULL, -- shirt, pants, apron, hat, shoes
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  issue_date DATE,
  return_date DATE,
  condition TEXT DEFAULT 'good', -- new, good, fair, poor, needs_replacement
  laundry_schedule TEXT, -- weekly, bi_weekly, after_each_shift
  last_cleaned DATE,
  replacement_due BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. DAILY OPERATIONS
-- ==========================================

-- Daily prep lists (#11)
CREATE TABLE IF NOT EXISTS daily_prep_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prep_date DATE NOT NULL,
  event_id UUID REFERENCES orders(id),
  recipe_id UUID REFERENCES recipes(id),
  item_name TEXT NOT NULL,
  quantity_needed DECIMAL(10,2) NOT NULL,
  unit TEXT NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  priority TEXT DEFAULT 'normal', -- urgent, high, normal, low
  estimated_time_minutes INTEGER,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Portion control standards (#12)
CREATE TABLE IF NOT EXISTS portion_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id),
  item_name TEXT NOT NULL,
  standard_portion_grams DECIMAL(10,2) NOT NULL,
  tolerance_grams DECIMAL(10,2) DEFAULT 5, -- allowed variance
  serving_tool TEXT, -- ladle_size, scoop_number, plate_guide
  visual_guide_url TEXT, -- photo of correct portion
  cost_per_portion DECIMAL(10,2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waitstaff briefings (#27)
CREATE TABLE IF NOT EXISTS event_briefings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES orders(id),
  briefing_date TIMESTAMP WITH TIME ZONE NOT NULL,
  briefed_by UUID REFERENCES profiles(id),
  menu_items TEXT[], -- array of menu items
  allergen_alerts TEXT[], -- special allergen notes
  service_flow TEXT, -- order of service
  special_instructions TEXT,
  quick_card_url TEXT, -- printed reference card
  attendees UUID[], -- array of staff who attended
  duration_minutes INTEGER,
  status TEXT DEFAULT 'scheduled', -- scheduled, completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Labour cost tracking (#39)
CREATE TABLE IF NOT EXISTS labour_cost_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours_worked DECIMAL(10,2) NOT NULL,
  regular_hours DECIMAL(10,2) NOT NULL,
  overtime_hours DECIMAL(10,2) DEFAULT 0,
  total_labour_cost DECIMAL(10,2) NOT NULL,
  total_revenue DECIMAL(10,2),
  labour_cost_percentage DECIMAL(5,2), -- calculated
  target_percentage DECIMAL(5,2) DEFAULT 30, -- target is 30%
  variance DECIMAL(5,2), -- difference from target
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Overtime tracking (#30)
CREATE TABLE IF NOT EXISTS overtime_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  regular_hours DECIMAL(5,2),
  overtime_hours DECIMAL(5,2) NOT NULL,
  reason TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved BOOLEAN DEFAULT false,
  cost DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Retention incentives tracking (#40)
CREATE TABLE IF NOT EXISTS retention_incentives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  incentive_type TEXT NOT NULL, -- quarterly_bonus, attendance_bonus, performance_bonus, anniversary
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  criteria_met BOOLEAN DEFAULT false,
  criteria_details TEXT,
  amount DECIMAL(10,2),
  paid_date DATE,
  status TEXT DEFAULT 'pending', -- pending, approved, paid
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batch cooking tracking (#3)
CREATE TABLE IF NOT EXISTS batch_cooking_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id),
  batch_number TEXT NOT NULL,
  batch_size INTEGER NOT NULL,
  cook_start_time TIMESTAMP WITH TIME ZONE,
  cook_end_time TIMESTAMP WITH TIME ZONE,
  holding_temp_celsius DECIMAL(4,1),
  cooling_start_time TIMESTAMP WITH TIME ZONE,
  cooling_end_time TIMESTAMP WITH TIME ZONE,
  final_storage_location TEXT,
  use_by_time TIMESTAMP WITH TIME ZONE,
  prepared_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'cooking', -- cooking, cooling, holding, finished, served
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_training_materials_company ON training_materials(company_id);
CREATE INDEX idx_staff_training_records_user ON staff_training_records(user_id);
CREATE INDEX idx_health_certificates_user_expiry ON health_certificates(user_id, expiry_date);
CREATE INDEX idx_staff_skills_matrix_user ON staff_skills_matrix(user_id);
CREATE INDEX idx_performance_reviews_user ON performance_reviews(user_id);
CREATE INDEX idx_daily_prep_lists_date ON daily_prep_lists(prep_date, status);
CREATE INDEX idx_event_briefings_event ON event_briefings(event_id);
CREATE INDEX idx_overtime_logs_user_date ON overtime_logs(user_id, date DESC);
CREATE INDEX idx_batch_cooking_logs_recipe ON batch_cooking_logs(recipe_id);

-- Enable RLS
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_skills_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_transport ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniform_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prep_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE portion_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_cost_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_cooking_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view company training materials" ON training_materials FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage company training materials" ON training_materials FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view their own training records" ON staff_training_records FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage training records" ON staff_training_records FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = (SELECT company_id FROM staff_training_records WHERE user_id = auth.uid())));

CREATE POLICY "Users can view their own health certificates" ON health_certificates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage health certificates" ON health_certificates FOR ALL USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = (SELECT company_id FROM health_certificates WHERE user_id = auth.uid())));

CREATE POLICY "Users can view their own emergency contacts" ON emergency_contacts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage their own emergency contacts" ON emergency_contacts FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view company prep lists" ON daily_prep_lists FOR SELECT USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can manage company prep lists" ON daily_prep_lists FOR ALL USING (company_id = auth.uid() OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));