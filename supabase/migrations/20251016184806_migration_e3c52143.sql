-- Create RLS policies only for existing tables
-- Skip driver_routes and other tables that don't exist yet

-- ===========================================
-- QUOTES TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes') THEN
    ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_quotes" ON quotes;
    DROP POLICY IF EXISTS "staff_create_company_quotes" ON quotes;
    DROP POLICY IF EXISTS "staff_update_company_quotes" ON quotes;
    DROP POLICY IF EXISTS "staff_delete_company_quotes" ON quotes;

    CREATE POLICY "staff_view_company_quotes"
    ON quotes FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_quotes"
    ON quotes FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_update_company_quotes"
    ON quotes FOR UPDATE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_delete_company_quotes"
    ON quotes FOR DELETE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;

-- ===========================================
-- LEADS TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_leads" ON leads;
    DROP POLICY IF EXISTS "staff_create_company_leads" ON leads;
    DROP POLICY IF EXISTS "staff_update_company_leads" ON leads;
    DROP POLICY IF EXISTS "staff_delete_company_leads" ON leads;

    CREATE POLICY "staff_view_company_leads"
    ON leads FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_leads"
    ON leads FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_update_company_leads"
    ON leads FOR UPDATE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_delete_company_leads"
    ON leads FOR DELETE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;

-- ===========================================
-- EQUIPMENT TRACKING TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'equipment_tracking') THEN
    ALTER TABLE equipment_tracking ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_equipment_tracking" ON equipment_tracking;
    DROP POLICY IF EXISTS "staff_create_company_equipment_tracking" ON equipment_tracking;
    DROP POLICY IF EXISTS "staff_update_company_equipment_tracking" ON equipment_tracking;

    CREATE POLICY "staff_view_company_equipment_tracking"
    ON equipment_tracking FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_equipment_tracking"
    ON equipment_tracking FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_update_company_equipment_tracking"
    ON equipment_tracking FOR UPDATE
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;

-- ===========================================
-- KITCHEN DUTY LOGS TABLE RLS (if exists)
-- ===========================================

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kitchen_duty_logs') THEN
    ALTER TABLE kitchen_duty_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "staff_view_company_kitchen_logs" ON kitchen_duty_logs;
    DROP POLICY IF EXISTS "staff_create_company_kitchen_logs" ON kitchen_duty_logs;

    CREATE POLICY "staff_view_company_kitchen_logs"
    ON kitchen_duty_logs FOR SELECT
    USING (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );

    CREATE POLICY "staff_create_company_kitchen_logs"
    ON kitchen_duty_logs FOR INSERT
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM profiles 
        WHERE id = auth.uid() AND company_id IS NOT NULL
      )
    );
  END IF;
END $$;