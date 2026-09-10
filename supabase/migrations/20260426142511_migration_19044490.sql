-- A. Missing RLS Policies (wrapped in individual DO blocks to prevent one typo failing the rest)
DO $$ BEGIN
    CREATE POLICY "company_access_delivery_stops" ON delivery_stops FOR ALL USING (
      order_id IN (SELECT id FROM orders WHERE company_id = get_user_company_id(auth.uid()))
    );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Failed delivery_stops: %', SQLERRM; END $$;

DO $$ BEGIN
    CREATE POLICY "company_access_order_items" ON order_items FOR ALL USING (
      order_id IN (SELECT id FROM orders WHERE company_id = get_user_company_id(auth.uid()))
    );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Failed order_items: %', SQLERRM; END $$;

DO $$ BEGIN
    CREATE POLICY "company_access_prep_list_items" ON prep_list_items FOR ALL USING (
      prep_list_id IN (SELECT id FROM prep_lists WHERE company_id = get_user_company_id(auth.uid()))
    );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Failed prep_list_items: %', SQLERRM; END $$;

DO $$ BEGIN
    CREATE POLICY "company_access_quote_items" ON quote_items FOR ALL USING (
      quote_id IN (SELECT id FROM quotes WHERE company_id = get_user_company_id(auth.uid()))
    );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Failed quote_items: %', SQLERRM; END $$;

DO $$ BEGIN
    CREATE POLICY "company_access_recipe_ingredients" ON recipe_ingredients FOR ALL USING (
      recipe_id IN (SELECT id FROM recipes WHERE company_id = get_user_company_id(auth.uid()))
    );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Failed recipe_ingredients: %', SQLERRM; END $$;