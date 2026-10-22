-- Quote/order source filenames live in document_import_files and booking notes.
-- Only clients have the legacy imported_filename column.
CREATE OR REPLACE FUNCTION public.commit_booking_document_import(
  p_document_id uuid, p_company_id uuid, p_actor_id uuid, p_version integer, p_review jsonb, p_readiness jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  d public.document_import_files%ROWTYPE;
  f jsonb := p_review->'fields'; l jsonb; v_client uuid; v_quote uuid; v_order uuid;
  v_item uuid; v_number text; v_menu jsonb := '[]'; v_equipment jsonb := '[]'; v_notes text;
  v_includes_vat boolean;
  v_region uuid := (p_review->>'region_id')::uuid; v_name text; v_currency text;
  v_quantity numeric; v_price numeric; v_total numeric; v_sum numeric := 0;
BEGIN
  IF current_user <> 'service_role' AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Server import required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO d FROM public.document_import_files WHERE id=p_document_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.status='committed' THEN RETURN jsonb_build_object('targetId',d.target_id,'alreadySaved',true); END IF;
  IF d.version<>p_version OR d.status<>'review' THEN RAISE EXCEPTION 'Document changed. Refresh before saving.' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND company_id=p_company_id AND coalesce(active_role::text,role::text) IN ('owner','super_admin','company_admin','admin')) THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.regions WHERE id=v_region AND company_id=p_company_id) THEN RAISE EXCEPTION 'Invalid branch'; END IF;
  IF coalesce((p_review->>'reviewed')::boolean,false)=false OR jsonb_array_length(p_review->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Complete the document review'; END IF;
  IF nullif(f->>'client_name','') IS NULL OR coalesce(f->>'client_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR nullif(f->>'event_name','') IS NULL
     OR nullif(f->>'event_date','') IS NULL OR nullif(f->>'event_time','') IS NULL OR nullif(f->>'venue_address','') IS NULL
     OR coalesce((f->>'guest_count')::numeric,0)<1 OR (f->>'guest_count')::numeric<>trunc((f->>'guest_count')::numeric)
     OR nullif(f->>'subtotal','') IS NULL OR nullif(f->>'tax_amount','') IS NULL OR nullif(f->>'total_amount','') IS NULL THEN RAISE EXCEPTION 'Complete the customer, event and amount details'; END IF;
  IF abs((f->>'subtotal')::numeric+(f->>'tax_amount')::numeric-(f->>'total_amount')::numeric)>0.02 THEN RAISE EXCEPTION 'Document amounts do not reconcile'; END IF;
  -- Serialise catalogue/client matching within this tenant, never across tenants.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text, 911));
  IF EXISTS(SELECT 1 FROM public.document_import_files WHERE company_id=p_company_id AND source_hash=d.source_hash AND status='committed') THEN RAISE EXCEPTION 'This PDF is already imported.' USING ERRCODE='23505'; END IF;
  IF nullif(f->>'reference','') IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.document_import_files x WHERE x.company_id=p_company_id AND x.status='committed'
      AND lower(x.reviewed_data->'fields'->>'reference')=lower(f->>'reference')
  ) THEN RAISE EXCEPTION 'This reference is already imported. Open the saved record instead.' USING ERRCODE='23505'; END IF;
  IF nullif(f->>'reference','') IS NOT NULL AND (
    (d.target_table='quotes' AND EXISTS(SELECT 1 FROM public.quotes WHERE company_id=p_company_id AND deleted_at IS NULL AND lower(quote_number)=lower(f->>'reference')))
    OR (d.target_table='orders' AND EXISTS(SELECT 1 FROM public.orders WHERE company_id=p_company_id AND deleted_at IS NULL AND lower(order_number)=lower(f->>'reference')))
  ) THEN RAISE EXCEPTION 'A record with this reference already exists. Review the existing record.' USING ERRCODE='23505'; END IF;

  SELECT coalesce(currency,'ZAR'),coalesce(pricing_includes_vat,false) INTO v_currency,v_includes_vat FROM public.companies WHERE id=p_company_id;
  IF nullif(f->>'currency','') IS NOT NULL AND upper(f->>'currency')<>upper(v_currency) THEN RAISE EXCEPTION 'Currency differs from company currency'; END IF;
  SELECT id INTO v_client FROM public.clients WHERE company_id=p_company_id AND lower(trim(email))=lower(trim(f->>'client_email')) AND deleted_at IS NULL LIMIT 1;
  IF v_client IS NULL THEN
    INSERT INTO public.clients(company_id, region_id, client_name, company_name, client_type, email, phone, mobile_number, import_job_id, imported_at, imported_filename, comms_paused_until)
    VALUES(p_company_id,v_region,f->>'client_name',nullif(f->>'client_company_name',''),CASE WHEN nullif(f->>'client_company_name','') IS NULL THEN 'individual' ELSE 'company' END,
      lower(trim(f->>'client_email')),coalesce(f->>'client_phone',''),nullif(f->>'client_phone',''),d.job_id,now(),d.filename,'infinity') RETURNING id INTO v_client;
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(p_review->'items') LOOP
    v_name := trim(l->>'name'); v_quantity := (l->>'quantity')::numeric; v_price := (l->>'unit_price')::numeric; v_total := (l->>'line_total')::numeric;
    IF v_name='' OR v_quantity IS NULL OR v_quantity<=0 OR v_price IS NULL OR v_price<0 OR v_total IS NULL OR v_total<0 OR abs(v_quantity*v_price-v_total)>0.02 THEN RAISE EXCEPTION 'Invalid item quantity or amounts'; END IF;
    v_sum := v_sum+v_total; v_item := nullif(l->>'catalogue_id','')::uuid;
    IF l->>'kind'='equipment' THEN
      IF v_quantity<>trunc(v_quantity) THEN RAISE EXCEPTION 'Equipment quantities must be whole numbers'; END IF;
      IF v_item IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.equipment WHERE id=v_item AND company_id=p_company_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Equipment belongs to another company or was removed'; END IF;
      IF v_item IS NULL AND (SELECT count(*) FROM public.equipment WHERE company_id=p_company_id AND deleted_at IS NULL AND lower(trim(name))=lower(v_name))>1 THEN RAISE EXCEPTION 'Choose the equipment catalogue match explicitly'; END IF;
      IF v_item IS NULL THEN
        SELECT id INTO v_item FROM public.equipment WHERE company_id=p_company_id AND deleted_at IS NULL AND lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(regexp_replace(v_name,'\s+',' ','g')) ORDER BY created_at LIMIT 1;
      END IF;
      IF v_item IS NULL THEN
        IF l->>'owned_quantity' IS NULL OR (l->>'owned_quantity')::numeric<0 OR (l->>'owned_quantity')::numeric<>trunc((l->>'owned_quantity')::numeric) THEN RAISE EXCEPTION 'Enter physical owned equipment stock'; END IF;
        INSERT INTO public.equipment(company_id,name,description,category,rental_price,quantity,available_quantity,requires_cleaning,cleaning_time_manual_minutes)
        VALUES(p_company_id,v_name,l->>'description',nullif(l->>'category',''),v_price,(l->>'owned_quantity')::integer,(l->>'owned_quantity')::integer,coalesce((l->>'requires_cleaning')::boolean,true),(l->>'cleaning_minutes')::numeric) RETURNING id INTO v_item;
      END IF;
      SELECT name INTO v_name FROM public.equipment WHERE id=v_item AND company_id=p_company_id;
      v_equipment := v_equipment || jsonb_build_array(jsonb_build_object('id',v_item,'equipment_id',v_item,'name',v_name,'quantity',v_quantity,'unit_price',v_price,'rental_price',v_price,'rentalPrice',v_price,'price',v_price,'line_total',v_total,'total',v_total));
    ELSIF l->>'kind' IN ('menu','service') THEN
      IF v_item IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.menu_items WHERE id=v_item AND company_id=p_company_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Menu item belongs to another company or was removed'; END IF;
      IF v_item IS NULL AND (SELECT count(*) FROM public.menu_items WHERE company_id=p_company_id AND deleted_at IS NULL AND lower(trim(item_name))=lower(v_name))>1 THEN RAISE EXCEPTION 'Choose the menu catalogue match explicitly'; END IF;
      IF v_item IS NULL THEN
        SELECT id INTO v_item FROM public.menu_items WHERE company_id=p_company_id AND deleted_at IS NULL AND lower(regexp_replace(trim(item_name),'\s+',' ','g'))=lower(regexp_replace(v_name,'\s+',' ','g')) ORDER BY created_at LIMIT 1;
      END IF;
      IF v_item IS NULL THEN
        INSERT INTO public.menu_items(company_id,item_name,description,category,base_price,base_servings,prep_time_minutes,cook_time_minutes,active,is_available,import_setup_required)
        VALUES(p_company_id,v_name,l->>'description',CASE WHEN l->>'kind'='service' THEN 'Service' ELSE coalesce(nullif(l->>'category',''),'Other') END,v_price,1,(l->>'prep_time_minutes')::numeric,(l->>'cook_time_minutes')::numeric,true,true,l->>'kind'='menu') RETURNING id INTO v_item;
      END IF;
      SELECT item_name INTO v_name FROM public.menu_items WHERE id=v_item AND company_id=p_company_id;
      v_menu := v_menu || jsonb_build_array(jsonb_build_object('id',v_item,'menu_item_id',v_item,'name',v_name,'item_name',v_name,'description',l->>'description','category',CASE WHEN l->>'kind'='service' THEN 'Service' ELSE l->>'category' END,'quantity',v_quantity,'unit_price',v_price,'price',v_price,'line_total',v_total,'total',v_total));
    ELSE RAISE EXCEPTION 'Choose dish, service or equipment for every item'; END IF;
  END LOOP;
  IF abs(v_sum+coalesce(nullif(f->>'delivery_fee','')::numeric,0)+coalesce(nullif(f->>'collection_fee','')::numeric,0)-coalesce(nullif(f->>'discount_amount','')::numeric,0)-(CASE WHEN v_includes_vat THEN f->>'total_amount' ELSE f->>'subtotal' END)::numeric)>0.02 THEN RAISE EXCEPTION 'Item totals differ from subtotal'; END IF;
  v_notes := concat_ws(E'\n',nullif(f->>'notes',''),'Imported from: '||d.filename, 'Original reference: '||nullif(f->>'reference',''), CASE WHEN nullif(f->>'dietary_requirements','') IS NOT NULL THEN 'Dietary requirements: '||(f->>'dietary_requirements') END);
  PERFORM set_config('app.booking_pdf_import','on',true);
  v_number := public.consume_next_document_number(p_company_id,'quote');
  INSERT INTO public.quotes(company_id,region_id,client_id,client_name,client_company_name,contact_name,client_email,client_phone,quote_number,quote_name,event_date,event_time,setup_time,guest_count,venue_address,subtotal,tax_amount,tax,delivery_fee,collection_fee,discount_amount,total_amount,total,currency,deposit_percentage,valid_until,terms_and_conditions,notes,menu_items,equipment_items,status,import_job_id,imported_at,comms_paused_until,external_source)
  VALUES(p_company_id,v_region,v_client,f->>'client_name',nullif(f->>'client_company_name',''),f->>'client_name',f->>'client_email',nullif(f->>'client_phone',''),v_number,f->>'event_name',(f->>'event_date')::date,(f->>'event_time')::time,nullif(f->>'setup_time','')::time,(f->>'guest_count')::integer,f->>'venue_address',(f->>'subtotal')::numeric,(f->>'tax_amount')::numeric,(f->>'tax_amount')::numeric,coalesce(nullif(f->>'delivery_fee','')::numeric,0),coalesce(nullif(f->>'collection_fee','')::numeric,0),coalesce(nullif(f->>'discount_amount','')::numeric,0),(f->>'total_amount')::numeric,(f->>'total_amount')::numeric,v_currency,nullif(f->>'deposit_percentage','')::numeric,nullif(f->>'valid_until','')::date,nullif(f->>'terms_and_conditions',''),v_notes,v_menu,v_equipment,'draft',d.job_id,now(),'infinity','import') RETURNING id INTO v_quote;
  IF d.target_table='orders' THEN
    -- Existing order-link trigger requires the quote to leave draft first.
    UPDATE public.quotes SET status='accepted',accepted_at=now() WHERE id=v_quote;
    v_number := public.consume_next_document_number(p_company_id,'order');
    INSERT INTO public.orders(company_id,region_id,client_id,client_name,client_company_name,client_email,client_phone,order_number,event_name,event_date,event_time,setup_time,guest_count,venue_address,subtotal,tax_amount,tax,delivery_fee,collection_fee,discount_amount,total_amount,currency,deposit_percentage,equipment_return_method,balance_due_date,dietary_requirements,kitchen_instructions,special_instructions,internal_notes,quote_id,status,import_job_id,imported_at,comms_paused_until)
    VALUES(p_company_id,v_region,v_client,f->>'client_name',nullif(f->>'client_company_name',''),f->>'client_email',nullif(f->>'client_phone',''),v_number,f->>'event_name',(f->>'event_date')::date,(f->>'event_time')::time,nullif(f->>'setup_time','')::time,(f->>'guest_count')::integer,f->>'venue_address',(f->>'subtotal')::numeric,(f->>'tax_amount')::numeric,(f->>'tax_amount')::numeric,coalesce(nullif(f->>'delivery_fee','')::numeric,0),coalesce(nullif(f->>'collection_fee','')::numeric,0),coalesce(nullif(f->>'discount_amount','')::numeric,0),(f->>'total_amount')::numeric,v_currency,nullif(f->>'deposit_percentage','')::numeric,nullif(f->>'equipment_return_method',''),nullif(f->>'balance_due_date','')::date,nullif(f->>'dietary_requirements',''),nullif(f->>'kitchen_instructions',''),nullif(f->>'special_instructions',''),v_notes,v_quote,CASE WHEN p_review->>'mode'='historical' THEN 'completed'::public.order_status ELSE 'pending'::public.order_status END,d.job_id,now(),'infinity') RETURNING id INTO v_order;
    INSERT INTO public.order_items(order_id,menu_item_id,item_name,description,quantity,unit_price,line_total)
    SELECT v_order,(x->>'id')::uuid,x->>'name',x->>'description',(x->>'quantity')::numeric,(x->>'unit_price')::numeric,(x->>'line_total')::numeric FROM jsonb_array_elements(v_menu) x;
    INSERT INTO public.equipment_bookings(company_id,order_id,equipment_id,quantity,unit_price,booked_from,booked_until,status)
    SELECT p_company_id,v_order,(x->>'id')::uuid,(x->>'quantity')::integer,(x->>'unit_price')::numeric,(f->>'event_date')::date,(f->>'event_date')::date,CASE WHEN p_review->>'mode'='historical' THEN 'returned' ELSE 'booked' END FROM jsonb_array_elements(v_equipment) x;
    UPDATE public.quotes SET converted_to_order_id=v_order,status='accepted',accepted_at=now() WHERE id=v_quote;
  END IF;
  UPDATE public.document_import_files SET status='committed',target_id=coalesce(v_order,v_quote),reviewed_data=p_review,readiness=p_readiness,version=version+1,updated_at=now() WHERE id=d.id;
  UPDATE public.import_jobs SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM public.document_import_files WHERE job_id=d.job_id AND status NOT IN ('committed','duplicate')) THEN 'completed' ELSE 'previewed' END,updated_at=now() WHERE id=d.job_id;
  RETURN jsonb_build_object('targetId',coalesce(v_order,v_quote),'quoteId',v_quote,'number',v_number);
END; $$;
REVOKE ALL ON FUNCTION public.commit_booking_document_import(uuid,uuid,uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_booking_document_import(uuid,uuid,uuid,integer,jsonb,jsonb) TO service_role;
