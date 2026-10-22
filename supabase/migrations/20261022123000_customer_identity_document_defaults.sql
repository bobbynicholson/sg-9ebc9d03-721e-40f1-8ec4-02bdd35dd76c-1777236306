BEGIN;

-- Preserve each booking's billing identity when refreshing documents.
CREATE OR REPLACE FUNCTION public.fill_customer_billing_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE billing_name text; known_client_id uuid;
BEGIN
  IF TG_TABLE_NAME='quotes' THEN
    IF NEW.client_id IS NULL AND nullif(btrim(NEW.client_email), '') IS NOT NULL THEN
      SELECT c.id INTO known_client_id FROM public.clients c WHERE c.company_id=NEW.company_id
        AND lower(btrim(c.email))=lower(btrim(NEW.client_email)) AND c.deleted_at IS NULL;
      NEW.client_id := known_client_id;
    END IF;
  END IF;
  NEW.client_company_name := nullif(btrim(NEW.client_company_name), '');
  IF NEW.client_company_name IS NOT NULL THEN RETURN NEW; END IF;
  -- An explicit edit to the billing name may clear it. Only inherit on
  -- creation or when a different customer/quote/lead is selected.
  IF TG_OP='UPDATE' THEN
    IF TG_TABLE_NAME='quotes' THEN
      IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id AND NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id THEN RETURN NEW; END IF;
    ELSE
      IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id AND NEW.quote_id IS NOT DISTINCT FROM OLD.quote_id THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='orders' THEN
    IF NEW.quote_id IS NOT NULL THEN
      SELECT q.client_company_name INTO billing_name FROM public.quotes q
        WHERE q.id=NEW.quote_id AND q.company_id=NEW.company_id;
      IF FOUND THEN NEW.client_company_name := billing_name; RETURN NEW; END IF;
    END IF;
  END IF;
  IF billing_name IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT nullif(btrim(c.company_name), '') INTO billing_name FROM public.clients c
      WHERE c.id=NEW.client_id AND c.company_id=NEW.company_id AND c.deleted_at IS NULL;
  END IF;
  IF TG_TABLE_NAME='quotes' AND billing_name IS NULL THEN
    IF NEW.lead_id IS NOT NULL THEN
      SELECT nullif(btrim(l.company_name), '') INTO billing_name FROM public.leads l
        WHERE l.id=NEW.lead_id AND l.company_id=NEW.company_id AND l.deleted_at IS NULL;
    END IF;
  END IF;
  NEW.client_company_name := billing_name;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_customer_billing_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.client_name IS NOT DISTINCT FROM OLD.client_name AND NEW.company_name IS NOT DISTINCT FROM OLD.company_name THEN RETURN NEW; END IF;
  UPDATE public.quotes SET
    client_name=CASE WHEN client_name=OLD.client_name OR nullif(btrim(client_name),'') IS NULL THEN NEW.client_name ELSE client_name END,
    contact_name=CASE WHEN contact_name=OLD.client_name OR nullif(btrim(contact_name),'') IS NULL THEN NEW.client_name ELSE contact_name END,
    client_company_name=CASE WHEN client_company_name IS NULL OR client_company_name IS NOT DISTINCT FROM nullif(btrim(OLD.company_name),'') THEN nullif(btrim(NEW.company_name),'') ELSE client_company_name END,
    updated_at=now()
  WHERE client_id=NEW.id AND company_id=NEW.company_id AND deleted_at IS NULL;
  UPDATE public.orders SET
    client_name=CASE WHEN client_name=OLD.client_name OR nullif(btrim(client_name),'') IS NULL THEN NEW.client_name ELSE client_name END,
    client_company_name=CASE WHEN client_company_name IS NULL OR client_company_name IS NOT DISTINCT FROM nullif(btrim(OLD.company_name),'') THEN nullif(btrim(NEW.company_name),'') ELSE client_company_name END,
    updated_at=now()
  WHERE client_id=NEW.id AND company_id=NEW.company_id AND deleted_at IS NULL;
  UPDATE public.leads SET contact_name=NEW.client_name, client_name=NEW.client_name,
    company_name=nullif(btrim(NEW.company_name),''), updated_at=now()
  WHERE converted_to_client_id=NEW.id AND company_id=NEW.company_id AND deleted_at IS NULL
    AND (contact_name=OLD.client_name OR nullif(btrim(contact_name),'') IS NULL)
    AND (company_name IS NULL OR company_name IS NOT DISTINCT FROM OLD.company_name);
  -- Refresh the metadata snapshot, without touching amounts or payment state.
  UPDATE public.invoices SET invoice_data=coalesce(invoice_data,'{}'::jsonb) || jsonb_build_object(
      'clientName', CASE WHEN invoice_data->>'clientName'=OLD.client_name OR nullif(invoice_data->>'clientName','') IS NULL THEN NEW.client_name ELSE invoice_data->>'clientName' END,
      'clientCompanyName', CASE WHEN EXISTS (SELECT 1 FROM public.orders o WHERE o.id=invoices.order_id AND o.company_id=NEW.company_id) THEN (SELECT o.client_company_name FROM public.orders o WHERE o.id=invoices.order_id AND o.company_id=NEW.company_id) WHEN nullif(invoice_data->>'clientCompanyName','') IS NULL OR invoice_data->>'clientCompanyName' IS NOT DISTINCT FROM OLD.company_name THEN nullif(btrim(NEW.company_name),'') ELSE invoice_data->>'clientCompanyName' END),
    updated_at=now()
  WHERE client_id=NEW.id AND company_id=NEW.company_id AND deleted_at IS NULL;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fill_invoice_customer_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE customer_name text; billing_name text;
BEGIN
  IF jsonb_typeof(NEW.invoice_data) IS DISTINCT FROM 'object' THEN NEW.invoice_data := '{}'::jsonb; END IF;
  IF NEW.order_id IS NOT NULL THEN
    SELECT o.client_name, o.client_company_name INTO customer_name, billing_name
      FROM public.orders o WHERE o.id=NEW.order_id AND o.company_id=NEW.company_id;
    IF FOUND THEN
      NEW.invoice_data := NEW.invoice_data || jsonb_build_object('clientCompanyName', billing_name);
    END IF;
  END IF;
  IF customer_name IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT c.client_name, c.company_name INTO customer_name, billing_name
      FROM public.clients c WHERE c.id=NEW.client_id AND c.company_id=NEW.company_id AND c.deleted_at IS NULL;
  END IF;
  IF NOT (NEW.invoice_data ? 'clientCompanyName') THEN
    NEW.invoice_data := NEW.invoice_data || jsonb_build_object('clientCompanyName', billing_name);
  END IF;
  IF nullif(btrim(NEW.invoice_data->>'clientName'), '') IS NULL AND customer_name IS NOT NULL THEN
    NEW.invoice_data := NEW.invoice_data || jsonb_build_object('clientName', customer_name);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fill_invoice_customer_identity ON public.invoices;
CREATE TRIGGER fill_invoice_customer_identity BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fill_invoice_customer_identity();
REVOKE ALL ON FUNCTION public.fill_invoice_customer_identity() FROM PUBLIC;
COMMIT;
