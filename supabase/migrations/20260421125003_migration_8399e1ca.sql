-- FACILITIES & EQUIPMENT TABLES
CREATE TABLE IF NOT EXISTS public.equipment_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  equipment_type TEXT,
  description TEXT,
  total_quantity INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  in_use_quantity INTEGER DEFAULT 0,
  broken_quantity INTEGER DEFAULT 0,
  rental_price_per_unit DECIMAL(10, 2),
  replacement_cost DECIMAL(10, 2),
  overall_condition equipment_condition DEFAULT 'good',
  storage_location TEXT,
  last_maintenance_date DATE,
  next_maintenance_due DATE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_equipment_inventory_company ON public.equipment_inventory(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_type ON public.equipment_inventory(company_id, equipment_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_available ON public.equipment_inventory(company_id) 
  WHERE available_quantity > 0 AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_equipment_inventory_updated_at ON public.equipment_inventory;
CREATE TRIGGER update_equipment_inventory_updated_at BEFORE UPDATE ON public.equipment_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.equipment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment_inventory(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  quantity_assigned INTEGER NOT NULL,
  status TEXT DEFAULT 'reserved',
  assigned_date DATE NOT NULL,
  expected_return_date DATE,
  actual_return_date DATE,
  condition_at_dispatch equipment_condition,
  condition_at_return equipment_condition,
  damage_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_assignments_company ON public.equipment_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_equipment ON public.equipment_assignments(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_order ON public.equipment_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assignments_status ON public.equipment_assignments(status);

DROP TRIGGER IF EXISTS update_equipment_assignments_updated_at ON public.equipment_assignments;
CREATE TRIGGER update_equipment_assignments_updated_at BEFORE UPDATE ON public.equipment_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.equipment_shortage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment_inventory(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  required_quantity INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  shortage_quantity INTEGER NOT NULL,
  severity TEXT DEFAULT 'medium',
  impact_description TEXT,
  status TEXT DEFAULT 'open',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  reported_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_shortage_company ON public.equipment_shortage_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_equipment ON public.equipment_shortage_reports(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_status ON public.equipment_shortage_reports(status);
CREATE INDEX IF NOT EXISTS idx_equipment_shortage_severity ON public.equipment_shortage_reports(severity);

DROP TRIGGER IF EXISTS update_equipment_shortage_updated_at ON public.equipment_shortage_reports;
CREATE TRIGGER update_equipment_shortage_updated_at BEFORE UPDATE ON public.equipment_shortage_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cleaning_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  area_name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  assigned_to UUID REFERENCES public.profiles(id),
  status cleaning_status DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id),
  verification_photos TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_company ON public.cleaning_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_date ON public.cleaning_schedules(company_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_assigned ON public.cleaning_schedules(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cleaning_schedules_status ON public.cleaning_schedules(status);

DROP TRIGGER IF EXISTS update_cleaning_schedules_updated_at ON public.cleaning_schedules;
CREATE TRIGGER update_cleaning_schedules_updated_at BEFORE UPDATE ON public.cleaning_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();