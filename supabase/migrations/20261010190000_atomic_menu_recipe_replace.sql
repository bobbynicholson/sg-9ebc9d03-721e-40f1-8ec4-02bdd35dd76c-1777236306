-- Replace a menu recipe and its ingredient rows as one transaction.
--
-- The old browser workflow upserted the recipe, deleted its ingredients and
-- inserted the replacement rows in three separate requests. If the browser
-- disconnected after the delete, a perfectly valid menu item was left with
-- an empty recipe and the demand forecast became wrong. A Postgres function
-- runs atomically: either every replacement row is saved or none are.

CREATE OR REPLACE FUNCTION public.replace_menu_recipe(
  p_company_id uuid,
  p_menu_item_id uuid,
  p_recipe jsonb DEFAULT NULL,
  p_ingredients jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_recipe_id uuid;
  v_menu_name text;
  v_ingredient jsonb;
  v_inventory_id uuid;
  v_quantity numeric;
  v_name text;
  v_unit text;
BEGIN
  -- Lock the parent item first. This also serialises two simultaneous saves
  -- from different tabs, so they cannot create competing recipe versions.
  SELECT item_name
    INTO v_menu_name
    FROM public.menu_items
   WHERE id = p_menu_item_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item does not belong to this company' USING ERRCODE = '42501';
  END IF;

  IF p_recipe IS NULL OR p_recipe = 'null'::jsonb THEN
    DELETE FROM public.recipes WHERE menu_item_id = p_menu_item_id;
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'Recipe ingredients must be an array' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(NULLIF(p_recipe->>'base_servings', '')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'Recipe base servings must be at least 1' USING ERRCODE = '22023';
  END IF;

  -- Existing deployments did not enforce a unique recipe per menu item.
  -- Lock and reuse the newest row so new saves remain deterministic without
  -- silently deleting historic duplicate recipes during this migration.
  SELECT id
    INTO v_recipe_id
    FROM public.recipes
   WHERE menu_item_id = p_menu_item_id
   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
   LIMIT 1
   FOR UPDATE;

  IF v_recipe_id IS NULL THEN
    INSERT INTO public.recipes (
      company_id, menu_item_id, recipe_name, base_servings,
      prep_time_minutes, cook_time_minutes, instructions
    ) VALUES (
      p_company_id,
      p_menu_item_id,
      COALESCE(NULLIF(btrim(p_recipe->>'recipe_name'), ''), v_menu_name),
      (p_recipe->>'base_servings')::integer,
      NULLIF(p_recipe->>'prep_time_minutes', '')::integer,
      NULLIF(p_recipe->>'cook_time_minutes', '')::integer,
      NULLIF(btrim(p_recipe->>'instructions'), '')
    ) RETURNING id INTO v_recipe_id;
  ELSE
    UPDATE public.recipes
       SET recipe_name = COALESCE(NULLIF(btrim(p_recipe->>'recipe_name'), ''), v_menu_name),
           base_servings = (p_recipe->>'base_servings')::integer,
           prep_time_minutes = NULLIF(p_recipe->>'prep_time_minutes', '')::integer,
           cook_time_minutes = NULLIF(p_recipe->>'cook_time_minutes', '')::integer,
           instructions = NULLIF(btrim(p_recipe->>'instructions'), '')
     WHERE id = v_recipe_id;
  END IF;

  DELETE FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;

  FOR v_ingredient IN SELECT value FROM jsonb_array_elements(p_ingredients)
  LOOP
    v_name := btrim(COALESCE(v_ingredient->>'ingredient_name', ''));
    v_unit := btrim(COALESCE(v_ingredient->>'unit', ''));
    v_quantity := NULLIF(v_ingredient->>'quantity', '')::numeric;
    v_inventory_id := NULLIF(v_ingredient->>'inventory_item_id', '')::uuid;

    IF v_name = '' OR v_unit = '' OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Each recipe ingredient needs a name, positive quantity and unit' USING ERRCODE = '22023';
    END IF;

    IF v_inventory_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM public.inventory_items
       WHERE id = v_inventory_id
         AND company_id = p_company_id
         AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Recipe ingredient inventory item does not belong to this company' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.recipe_ingredients (
      recipe_id, ingredient_name, quantity, unit, inventory_item_id, notes
    ) VALUES (
      v_recipe_id,
      v_name,
      v_quantity,
      v_unit,
      v_inventory_id,
      NULLIF(btrim(COALESCE(v_ingredient->>'notes', '')), '')
    );
  END LOOP;

  RETURN v_recipe_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_menu_recipe(uuid, uuid, jsonb, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.replace_menu_recipe(uuid, uuid, jsonb, jsonb) IS
  'Atomically replaces one menu item recipe and its ingredient rows.';
