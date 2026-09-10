-- KITCHEN & INVENTORY TABLES
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  sku TEXT,
  unit_of_measure TEXT NOT NULL,
  current_stock DECIMAL(10, 3) DEFAULT 0,
  minimum_stock DECIMAL(10, 3) DEFAULT 0,
  maximum_stock DECIMAL(10, 3),
  reorder_quantity DECIMAL(10, 3),
  cost_per_unit DECIMAL(10, 2),
  preferred_supplier_id UUID,
  storage_location TEXT,
  storage_instructions TEXT,
  is_perishable BOOLEAN DEFAULT FALSE,
  shelf_life_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_company ON public.inventory_items(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON public.inventory_items(company_id, category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_low_stock ON public.inventory_items(company_id) 
  WHERE current_stock <= minimum_stock AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  payment_terms INTEGER DEFAULT 30,
  account_number TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON public.suppliers(company_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add FK to inventory_items after suppliers table exists
DO $$ BEGIN
  ALTER TABLE public.inventory_items
    DROP CONSTRAINT IF EXISTS fk_inventory_preferred_supplier;
  ALTER TABLE public.inventory_items
    ADD CONSTRAINT fk_inventory_preferred_supplier
    FOREIGN KEY (preferred_supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES public.inventory_items(id),
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10, 3) NOT NULL,
  unit TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_inventory ON public.recipe_ingredients(inventory_item_id);

DROP TRIGGER IF EXISTS update_recipe_ingredients_updated_at ON public.recipe_ingredients;
CREATE TRIGGER update_recipe_ingredients_updated_at BEFORE UPDATE ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  transaction_type transaction_type NOT NULL,
  quantity DECIMAL(10, 3) NOT NULL,
  unit_cost DECIMAL(10, 2),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference_number TEXT,
  notes TEXT,
  performed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company ON public.inventory_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON public.inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_order ON public.inventory_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date ON public.inventory_transactions(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.prep_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  prep_date DATE NOT NULL,
  assigned_to UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prep_lists_company ON public.prep_lists(company_id);
CREATE INDEX IF NOT EXISTS idx_prep_lists_order ON public.prep_lists(order_id);
CREATE INDEX IF NOT EXISTS idx_prep_lists_date ON public.prep_lists(company_id, prep_date);
CREATE INDEX IF NOT EXISTS idx_prep_lists_assigned ON public.prep_lists(assigned_to);

DROP TRIGGER IF EXISTS update_prep_lists_updated_at ON public.prep_lists;
CREATE TRIGGER update_prep_lists_updated_at BEFORE UPDATE ON public.prep_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.prep_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_list_id UUID NOT NULL REFERENCES public.prep_lists(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  task_description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prep_list_items_prep_list ON public.prep_list_items(prep_list_id);
CREATE INDEX IF NOT EXISTS idx_prep_list_items_completed ON public.prep_list_items(is_completed);

DROP TRIGGER IF EXISTS update_prep_list_items_updated_at ON public.prep_list_items;
CREATE TRIGGER update_prep_list_items_updated_at BEFORE UPDATE ON public.prep_list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.kitchen_duties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  duty_date DATE NOT NULL,
  shift duty_shift NOT NULL,
  is_on_duty BOOLEAN DEFAULT FALSE,
  clock_in_time TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kitchen_duties_company ON public.kitchen_duties(company_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duties_staff ON public.kitchen_duties(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duties_date ON public.kitchen_duties(company_id, duty_date);

DROP TRIGGER IF EXISTS update_kitchen_duties_updated_at ON public.kitchen_duties;
CREATE TRIGGER update_kitchen_duties_updated_at BEFORE UPDATE ON public.kitchen_duties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();