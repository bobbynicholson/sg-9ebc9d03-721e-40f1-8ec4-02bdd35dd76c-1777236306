-- PDF sources are private; the older `imports` bucket is public for receipt photos.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('booking-imports', 'booking-imports', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false, file_size_limit=20971520, allowed_mime_types=ARRAY['application/pdf'];

CREATE TABLE public.document_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  target_table text NOT NULL CHECK(target_table IN ('quotes','orders')),
  filename text NOT NULL, storage_path text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 20971520),
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','extracting','review','error','committed','duplicate')),
  extraction jsonb, reviewed_data jsonb, readiness jsonb NOT NULL DEFAULT '[]',
  target_id uuid, duplicate_of uuid REFERENCES public.document_import_files(id),
  page_count integer, model text, used_vision boolean NOT NULL DEFAULT false,
  error_message text, version integer NOT NULL DEFAULT 0,
  setup_completed_at timestamptz, setup_completed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_import_files_job_idx ON public.document_import_files(company_id, job_id);
CREATE INDEX document_import_files_target_idx ON public.document_import_files(company_id, target_table, target_id);
CREATE UNIQUE INDEX document_import_files_content_unique ON public.document_import_files(company_id, source_hash) WHERE status='committed';
ALTER TABLE public.document_import_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_import_admin_read ON public.document_import_files FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.company_id=document_import_files.company_id
    AND coalesce(p.active_role::text,p.role::text) IN ('owner','super_admin','company_admin','admin'))
);
GRANT SELECT ON public.document_import_files TO authenticated;
GRANT ALL ON public.document_import_files TO service_role;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS import_setup_required boolean NOT NULL DEFAULT false;

-- All writes occur in one transaction. Retrying after a lost response returns the
-- original record. A batch may partially finish; each individual PDF is atomic.
ALTER TABLE public.equipment_bookings ADD COLUMN IF NOT EXISTS unit_price numeric CHECK (unit_price >= 0);

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
  INSERT INTO public.quotes(company_id,region_id,client_id,client_name,client_company_name,contact_name,client_email,client_phone,quote_number,quote_name,event_date,event_time,setup_time,guest_count,venue_address,subtotal,tax_amount,tax,delivery_fee,collection_fee,discount_amount,total_amount,total,currency,deposit_percentage,valid_until,terms_and_conditions,notes,menu_items,equipment_items,status,import_job_id,imported_at,imported_filename,comms_paused_until,external_source)
  VALUES(p_company_id,v_region,v_client,f->>'client_name',nullif(f->>'client_company_name',''),f->>'client_name',f->>'client_email',nullif(f->>'client_phone',''),v_number,f->>'event_name',(f->>'event_date')::date,(f->>'event_time')::time,nullif(f->>'setup_time','')::time,(f->>'guest_count')::integer,f->>'venue_address',(f->>'subtotal')::numeric,(f->>'tax_amount')::numeric,(f->>'tax_amount')::numeric,coalesce(nullif(f->>'delivery_fee','')::numeric,0),coalesce(nullif(f->>'collection_fee','')::numeric,0),coalesce(nullif(f->>'discount_amount','')::numeric,0),(f->>'total_amount')::numeric,(f->>'total_amount')::numeric,v_currency,nullif(f->>'deposit_percentage','')::numeric,nullif(f->>'valid_until','')::date,nullif(f->>'terms_and_conditions',''),v_notes,v_menu,v_equipment,'draft',d.job_id,now(),d.filename,'infinity','import') RETURNING id INTO v_quote;
  IF d.target_table='orders' THEN
    v_number := public.consume_next_document_number(p_company_id,'order');
    INSERT INTO public.orders(company_id,region_id,client_id,client_name,client_company_name,client_email,client_phone,order_number,event_name,event_date,event_time,setup_time,guest_count,venue_address,subtotal,tax_amount,tax,delivery_fee,collection_fee,discount_amount,total_amount,currency,deposit_percentage,equipment_return_method,balance_due_date,dietary_requirements,kitchen_instructions,special_instructions,internal_notes,quote_id,status,import_job_id,imported_at,imported_filename,comms_paused_until)
    VALUES(p_company_id,v_region,v_client,f->>'client_name',nullif(f->>'client_company_name',''),f->>'client_email',nullif(f->>'client_phone',''),v_number,f->>'event_name',(f->>'event_date')::date,(f->>'event_time')::time,nullif(f->>'setup_time','')::time,(f->>'guest_count')::integer,f->>'venue_address',(f->>'subtotal')::numeric,(f->>'tax_amount')::numeric,(f->>'tax_amount')::numeric,coalesce(nullif(f->>'delivery_fee','')::numeric,0),coalesce(nullif(f->>'collection_fee','')::numeric,0),coalesce(nullif(f->>'discount_amount','')::numeric,0),(f->>'total_amount')::numeric,v_currency,nullif(f->>'deposit_percentage','')::numeric,nullif(f->>'equipment_return_method',''),nullif(f->>'balance_due_date','')::date,nullif(f->>'dietary_requirements',''),nullif(f->>'kitchen_instructions',''),nullif(f->>'special_instructions',''),v_notes,v_quote,CASE WHEN p_review->>'mode'='historical' THEN 'completed'::public.order_status ELSE 'pending'::public.order_status END,d.job_id,now(),d.filename,'infinity') RETURNING id INTO v_order;
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

-- Live readiness is derived from the real catalogue, not a dismissible flag.
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
  FOR m IN SELECT * FROM public.menu_items WHERE company_id=p_company_id AND id=ANY(ids) AND import_setup_required LOOP
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

CREATE OR REPLACE FUNCTION public.guard_booking_import_readiness() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE gaps jsonb; cid uuid; oid uuid;
BEGIN
  IF current_setting('app.booking_pdf_import',true)='on' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='quotes' THEN
    IF NEW.status::text NOT IN ('sent','accepted') THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    gaps:=public.booking_import_gaps(NEW.company_id,NEW.id,NULL,NULL,true);
  ELSIF TG_TABLE_NAME='orders' THEN
    IF NEW.status::text IN ('draft','pending','cancelled','postponed','paused') THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    gaps:=public.booking_import_gaps(NEW.company_id,NEW.quote_id,NEW.id,NULL,true);
  ELSE
    IF NEW.status::text IN ('pending','assigned','cancelled','rejected','skipped') THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    oid:=NEW.order_id; SELECT company_id INTO cid FROM public.orders WHERE id=oid;
    gaps:=public.booking_import_gaps(cid,NULL,oid,NULL,true);
  END IF;
  IF jsonb_array_length(gaps)>0 THEN RAISE EXCEPTION 'Complete imported details first. %',gaps->0->>'message' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER quote_import_readiness AFTER INSERT OR UPDATE ON public.quotes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_booking_import_readiness();
CREATE CONSTRAINT TRIGGER order_import_readiness AFTER INSERT OR UPDATE ON public.orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_booking_import_readiness();
CREATE TRIGGER kitchen_import_readiness BEFORE INSERT OR UPDATE OF status ON public.kitchen_prep_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_booking_import_readiness();

CREATE TRIGGER driver_import_readiness BEFORE INSERT OR UPDATE OF status ON public.driver_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_booking_import_readiness();

CREATE OR REPLACE FUNCTION public.guard_pdf_import_comms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce((NEW.summary->>'document_import')::boolean,false) AND NEW.comms_enabled_at IS NOT NULL AND OLD.comms_enabled_at IS NULL
    AND EXISTS(SELECT 1 FROM public.document_import_files WHERE job_id=NEW.id AND (status NOT IN ('committed','duplicate') OR (status='committed' AND setup_completed_at IS NULL))) THEN
    RAISE EXCEPTION 'Complete PDF import setup before enabling communications.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER pdf_import_comms_readiness BEFORE UPDATE OF comms_enabled_at ON public.import_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_pdf_import_comms();

CREATE OR REPLACE FUNCTION public.preserve_import_menu_setup_marker() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.import_setup_required AND NOT NEW.import_setup_required THEN
    RAISE EXCEPTION 'Complete the recipe and inventory setup; the import requirement cannot be dismissed.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER preserve_import_menu_setup BEFORE UPDATE OF import_setup_required ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.preserve_import_menu_setup_marker();
