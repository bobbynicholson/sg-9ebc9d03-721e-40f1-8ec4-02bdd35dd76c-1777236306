-- Create comprehensive RLS policies for company data isolation

-- ===========================================
-- COMPANIES TABLE RLS
-- ===========================================

-- Enable RLS on companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Company owners can view their own companies
CREATE POLICY "owners_view_own_company"
ON companies FOR SELECT
USING (auth.uid() = owner_id);

-- Company staff can view their company through profiles
CREATE POLICY "staff_view_company"
ON companies FOR SELECT
USING (
  id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Company owners can update their own companies
CREATE POLICY "owners_update_company"
ON companies FOR UPDATE
USING (auth.uid() = owner_id);

-- Users can insert companies during signup (owner_id must match auth.uid)
CREATE POLICY "users_create_own_company"
ON companies FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- ===========================================
-- ORDERS TABLE RLS
-- ===========================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Staff can view their company's orders
CREATE POLICY "staff_view_company_orders"
ON orders FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Staff can create orders for their company
CREATE POLICY "staff_create_company_orders"
ON orders FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Staff can update their company's orders
CREATE POLICY "staff_update_company_orders"
ON orders FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- Staff can delete their company's orders
CREATE POLICY "staff_delete_company_orders"
ON orders FOR DELETE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- ===========================================
-- INVENTORY TABLE RLS
-- ===========================================

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_company_inventory"
ON inventory FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_create_company_inventory"
ON inventory FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_update_company_inventory"
ON inventory FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_delete_company_inventory"
ON inventory FOR DELETE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

-- ===========================================
-- EQUIPMENT TABLE RLS
-- ===========================================

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_company_equipment"
ON equipment FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_create_company_equipment"
ON equipment FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_update_company_equipment"
ON equipment FOR UPDATE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);

CREATE POLICY "staff_delete_company_equipment"
ON equipment FOR DELETE
USING (
  company_id IN (
    SELECT company_id 
    FROM profiles 
    WHERE id = auth.uid() AND company_id IS NOT NULL
  )
);