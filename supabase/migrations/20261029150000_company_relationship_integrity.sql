-- A company-owned row must not link a business record from another company.
-- Plain UUID foreign keys alone do not enforce this. Check new/changed links
-- even for service-role writes so API mistakes cannot mix tenant records.
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_company_relationship()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE child jsonb := to_jsonb(NEW); parent_company uuid; child_company uuid;
  referenced_id uuid; parent_found boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND child -> TG_ARGV[0] IS NOT DISTINCT FROM to_jsonb(OLD) -> TG_ARGV[0]
    AND child -> 'company_id' IS NOT DISTINCT FROM to_jsonb(OLD) -> 'company_id'
    AND (TG_NARGS < 6 OR child -> TG_ARGV[3] IS NOT DISTINCT FROM to_jsonb(OLD) -> TG_ARGV[3]) THEN RETURN NEW; END IF;
  child_company := (child ->> 'company_id')::uuid;
  IF TG_NARGS = 6 THEN
    EXECUTE format('SELECT company_id FROM public.%I WHERE %I = $1', TG_ARGV[4], TG_ARGV[5])
      INTO child_company USING (child ->> TG_ARGV[3])::uuid;
  END IF;
  referenced_id := (child ->> TG_ARGV[0])::uuid;
  IF referenced_id IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT company_id, true FROM public.%I WHERE %I = $1', TG_ARGV[1], TG_ARGV[2])
    INTO parent_company, parent_found USING referenced_id;
  -- Missing parents remain the foreign key's responsibility. NULL-company
  -- reference rows are allowed only in explicitly shared catalogues.
  IF parent_found IS NOT TRUE THEN RETURN NEW; END IF;
  IF parent_company IS NULL AND TG_ARGV[1] = ANY(ARRAY['allergens', 'public_holidays', 'training_materials']) THEN RETURN NEW; END IF;
  IF child_company IS NULL OR parent_company IS DISTINCT FROM child_company THEN
    RAISE EXCEPTION 'Related record must belong to the same company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_company_relationship() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT child.relname AS child_table, ca.attname AS child_column,
      parent.relname AS parent_table, pa.attname AS parent_column, con.oid
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace cn ON cn.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace pn ON pn.oid = parent.relnamespace
    JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = con.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = con.confkey[1]
    WHERE con.contype = 'f' AND cardinality(con.conkey) = 1
      AND cn.nspname = 'public' AND pn.nspname = 'public'
      AND ca.atttypid = 'uuid'::regtype AND pa.atttypid = 'uuid'::regtype
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = child.oid AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = parent.oid AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
      AND child.relname <> 'profiles'
      AND (parent.relname = ANY(ARRAY['clients', 'orders', 'quotes', 'leads', 'regions',
        'menu_items', 'booking_packages', 'equipment', 'equipment_kits', 'inventory_items',
        'suppliers', 'recipes', 'shopping_lists', 'purchase_receipts', 'import_jobs',
        'outsource_providers', 'kitchen_shifts', 'kitchen_staff_shifts', 'vehicles', 'invoices',
        'allergens', 'public_holidays', 'training_materials'])
        OR (parent.relname = 'profiles' AND ca.attname IN
          ('assigned_driver_id', 'secondary_driver_id', 'assigned_chef_id', 'staff_id', 'driver_id', 'waiter_id')))
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'company_fk_' || fk.child_column, fk.child_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationship(%L, %L, %L)',
      'company_fk_' || fk.child_column, fk.child_table, fk.child_column, fk.parent_table, fk.parent_column);
  END LOOP;
END $$;

-- Line items inherit ownership through their order/recipe/list instead of
-- carrying company_id. Validate catalogue references against that owner.
DO $$
DECLARE link record; fk record;
BEGIN
  FOR link IN SELECT * FROM (VALUES
    ('order_items', 'order_id', 'orders'),
    ('recipe_ingredients', 'recipe_id', 'recipes'),
    ('shopping_list_items', 'shopping_list_id', 'shopping_lists'),
    ('purchase_receipt_items', 'receipt_id', 'purchase_receipts'),
    ('delivery_route_stops', 'order_id', 'orders'),
    ('driver_confirmations', 'order_id', 'orders'),
    ('kitchen_task_completions', 'order_id', 'orders')
  ) AS ownership(child_table, owner_column, owner_table)
  LOOP
    IF to_regclass('public.' || link.child_table) IS NULL OR EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = link.child_table AND column_name = 'company_id'
    ) THEN CONTINUE; END IF;
    FOR fk IN SELECT ca.attname AS child_column, parent.relname AS parent_table,
        pa.attname AS parent_column
      FROM pg_constraint con
      JOIN pg_class parent ON parent.oid = con.confrelid
      JOIN pg_namespace pn ON pn.oid = parent.relnamespace
      JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = con.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = con.confkey[1]
      WHERE con.contype = 'f' AND cardinality(con.conkey) = 1
        AND con.conrelid = to_regclass('public.' || link.child_table)
        AND pn.nspname = 'public' AND ca.attname <> link.owner_column
        AND ca.atttypid = 'uuid'::regtype
        AND parent.relname = ANY(ARRAY['orders', 'menu_items', 'equipment', 'inventory_items', 'recipes', 'suppliers', 'vehicles'])
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = parent.oid AND a.attname = 'company_id' AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped)
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'company_fk_' || fk.child_column, link.child_table);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_relationship(%L, %L, %L, %L, %L, %L)',
        'company_fk_' || fk.child_column, link.child_table, fk.child_column, fk.parent_table, fk.parent_column,
        link.owner_column, link.owner_table, 'id');
    END LOOP;
  END LOOP;
END $$;
COMMIT;
