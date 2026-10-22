-- Enforce the setup shown during review for matched dishes as well as new dishes.
CREATE OR REPLACE FUNCTION public.booking_import_gaps(p_company_id uuid,p_quote_id uuid DEFAULT NULL,p_order_id uuid DEFAULT NULL,p_menu_ids uuid[] DEFAULT NULL,p_include_review boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE gaps jsonb := '[]'; m record; d record; v_quote uuid:=p_quote_id; ids uuid[]:=coalesce(p_menu_ids,'{}');
BEGIN
  IF p_order_id IS NOT NULL THEN
    SELECT quote_id INTO v_quote FROM public.orders WHERE id=p_order_id AND company_id=p_company_id AND deleted_at IS NULL;
    ids:=ids||ARRAY(SELECT i.menu_item_id FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE o.id=p_order_id AND o.company_id=p_company_id AND i.menu_item_id IS NOT NULL);
  END IF;
  IF v_quote IS NOT NULL THEN
    ids:=ids||ARRAY(SELECT coalesce(nullif(x->>'menu_item_id',''),nullif(x->>'id',''))::uuid FROM public.quotes q CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(q.menu_items)='array' THEN q.menu_items ELSE '[]'::jsonb END) x WHERE q.id=v_quote AND q.company_id=p_company_id AND coalesce(nullif(x->>'menu_item_id',''),nullif(x->>'id','')) ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$');
  END IF;
  FOR m IN SELECT * FROM public.menu_items WHERE company_id=p_company_id AND id=ANY(ids) AND (import_setup_required OR id IN (
    -- Existing catalogue dishes still need complete recipes for this imported
    -- booking; other bookings using legacy catalogue items are unaffected.
    SELECT nullif(line->>'catalogue_id','')::uuid
    FROM public.document_import_files source
    CROSS JOIN LATERAL jsonb_array_elements(source.reviewed_data->'items') line
    WHERE source.company_id=p_company_id AND source.status='committed' AND line->>'kind'='menu'
      AND ((source.target_table='quotes' AND source.target_id=v_quote)
        OR (source.target_table='orders' AND source.target_id=coalesce(p_order_id,(SELECT converted_to_order_id FROM public.quotes WHERE id=v_quote AND company_id=p_company_id))))
  )) LOOP
    IF m.deleted_at IS NOT NULL OR m.prep_time_minutes IS NULL OR m.cook_time_minutes IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.recipes r WHERE r.menu_item_id=m.id AND r.company_id=p_company_id AND r.base_servings>0
      AND EXISTS(SELECT 1 FROM public.recipe_ingredients i WHERE i.recipe_id=r.id AND i.quantity>0)
      AND NOT EXISTS(SELECT 1 FROM public.recipe_ingredients i WHERE i.recipe_id=r.id AND (i.inventory_item_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.inventory_items inv WHERE inv.id=i.inventory_item_id AND inv.company_id=p_company_id) OR i.quantity<=0 OR nullif(trim(i.unit),'') IS NULL))
    ) THEN gaps:=gaps||jsonb_build_array(jsonb_build_object('message',m.item_name||': complete preparation times, recipe and ingredient inventory links.','href','/admin/menu?item='||m.id,'kind','menu')); END IF;
  END LOOP;
  IF p_include_review THEN
    FOR d IN SELECT * FROM public.document_import_files WHERE company_id=p_company_id AND status='committed' AND setup_completed_at IS NULL AND ((target_table='orders' AND target_id=coalesce(p_order_id,(SELECT converted_to_order_id FROM public.quotes WHERE id=v_quote AND company_id=p_company_id))) OR (target_table='quotes' AND target_id=v_quote)) LOOP
      gaps:=gaps||jsonb_build_array(jsonb_build_object('message','Complete setup for '||d.filename||' before sending, confirming or starting work.','href','/admin/document-imports?job='||d.job_id||'&document='||d.id,'kind','review'));
    END LOOP;
  END IF;
  RETURN gaps;
END; $$;
REVOKE ALL ON FUNCTION public.booking_import_gaps(uuid,uuid,uuid,uuid[],boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.booking_import_gaps(uuid,uuid,uuid,uuid[],boolean) TO service_role;
