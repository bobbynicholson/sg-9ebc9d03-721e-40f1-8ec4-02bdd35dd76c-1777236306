-- B. Drop Duplicate RLS Policies using active_role::text
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE tablename IN ('clients', 'inventory_items', 'leads', 'orders', 'quotes', 'equipment_inventory')
        AND (qual LIKE '%active_role::text%' OR with_check LIKE '%active_role::text%')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END
$$;