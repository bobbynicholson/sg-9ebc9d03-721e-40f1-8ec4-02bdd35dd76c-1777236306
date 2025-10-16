-- 1. Fleet Management Tables (#61, #62, #68, #69, #72)
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    make TEXT,
    model TEXT,
    year INT,
    vin TEXT UNIQUE,
    license_plate TEXT,
    status TEXT DEFAULT 'active', -- e.g., active, in_service, sold
    mileage INT DEFAULT 0,
    purchase_date DATE,
    purchase_price NUMERIC,
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    insurance_expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage their company's vehicles" ON vehicles
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
    );

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
    service_date DATE NOT NULL,
    service_type TEXT NOT NULL, -- e.g., Oil Change, Tire Rotation, Annual Service
    description TEXT,
    cost NUMERIC,
    provider TEXT,
    mileage_at_service INT,
    next_service_due_date DATE,
    next_service_due_mileage INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage maintenance for their company's vehicles" ON vehicle_maintenance
    FOR ALL USING (
        (SELECT company_id FROM vehicles WHERE id = vehicle_id) IN 
        (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS vehicle_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
    log_date DATE NOT NULL,
    log_type TEXT NOT NULL, -- e.g., Fuel, Cleaning, Incident
    value_numeric NUMERIC, -- For fuel cost, liters, etc.
    value_text TEXT, -- For notes, cleaning details
    logged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vehicle_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage logs for their company's vehicles" ON vehicle_logs
    FOR ALL USING (
        (SELECT company_id FROM vehicles WHERE id = vehicle_id) IN 
        (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
    );


-- 2. Equipment Kit Tables (#42, #70)
CREATE TABLE IF NOT EXISTS equipment_kits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    kit_size TEXT, -- e.g., small, medium, large
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

ALTER TABLE equipment_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage their company's equipment kits" ON equipment_kits
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
    );

CREATE TABLE IF NOT EXISTS equipment_kit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kit_id UUID REFERENCES equipment_kits(id) ON DELETE CASCADE NOT NULL,
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
    quantity INT NOT NULL,
    notes TEXT,
    UNIQUE(kit_id, equipment_id)
);

ALTER TABLE equipment_kit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage items in their company's kits" ON equipment_kit_items
    FOR ALL USING (
        (SELECT company_id FROM equipment_kits WHERE id = kit_id) IN 
        (SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
    );


-- 3. Financial Depreciation Table (#54)
CREATE TABLE IF NOT EXISTS financial_depreciation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
    purchase_price NUMERIC NOT NULL,
    purchase_date DATE NOT NULL,
    useful_life_years INT NOT NULL,
    salvage_value NUMERIC DEFAULT 0,
    depreciation_method TEXT DEFAULT 'straight_line',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE financial_depreciation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company staff can manage depreciation for their company's equipment" ON financial_depreciation
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
    );