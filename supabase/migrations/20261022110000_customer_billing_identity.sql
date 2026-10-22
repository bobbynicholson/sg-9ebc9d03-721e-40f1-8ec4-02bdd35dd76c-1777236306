BEGIN;

-- client_name is always the person used by communication templates.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS client_company_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_company_name text;
COMMENT ON COLUMN public.clients.company_name IS 'Customer organisation billed on documents; client_name is the contact person.';
COMMENT ON COLUMN public.quotes.client_company_name IS 'Customer billing organisation, separate from the contact in client_name.';
COMMENT ON COLUMN public.orders.client_company_name IS 'Customer billing organisation carried from the quote/contact.';

-- Only recover explicit organisations. Never guess whether a legacy name
-- belongs to a person or a company.
UPDATE public.clients c SET company_name = l.company_name
FROM (SELECT DISTINCT ON (company_id, converted_to_client_id)
        company_id, converted_to_client_id, nullif(btrim(company_name), '') AS company_name
      FROM public.leads WHERE converted_to_client_id IS NOT NULL
        AND deleted_at IS NULL AND nullif(btrim(company_name), '') IS NOT NULL
      ORDER BY company_id, converted_to_client_id, updated_at DESC NULLS LAST, id) l
WHERE c.id=l.converted_to_client_id AND c.company_id=l.company_id
  AND c.company_name IS NULL;
UPDATE public.quotes q SET client_company_name=c.company_name
FROM public.clients c WHERE q.client_id=c.id AND q.company_id=c.company_id
  AND q.client_company_name IS NULL AND c.company_name IS NOT NULL;
UPDATE public.quotes q SET client_company_name=nullif(btrim(l.company_name), '')
FROM public.leads l WHERE q.lead_id=l.id AND q.company_id=l.company_id
  AND q.client_company_name IS NULL AND nullif(btrim(l.company_name), '') IS NOT NULL;
UPDATE public.orders o SET client_company_name=q.client_company_name
FROM public.quotes q WHERE o.quote_id=q.id AND o.company_id=q.company_id
  AND o.client_company_name IS NULL AND q.client_company_name IS NOT NULL;
UPDATE public.orders o SET client_company_name=c.company_name
FROM public.clients c WHERE o.client_id=c.id AND o.company_id=c.company_id
  AND o.client_company_name IS NULL AND c.company_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fill_customer_billing_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE billing_name text;
BEGIN
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
DROP TRIGGER IF EXISTS fill_quote_billing_identity ON public.quotes;
CREATE TRIGGER fill_quote_billing_identity BEFORE INSERT OR UPDATE OF client_id, lead_id, client_company_name ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.fill_customer_billing_identity();
DROP TRIGGER IF EXISTS fill_order_billing_identity ON public.orders;
CREATE TRIGGER fill_order_billing_identity BEFORE INSERT OR UPDATE OF client_id, quote_id, client_company_name ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fill_customer_billing_identity();

-- Keep linked records that still use this contact's default in sync.
-- Deliberately different quote/order billing identities stay intact.
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
      'clientCompanyName', CASE WHEN nullif(invoice_data->>'clientCompanyName','') IS NULL OR invoice_data->>'clientCompanyName' IS NOT DISTINCT FROM OLD.company_name THEN nullif(btrim(NEW.company_name),'') ELSE invoice_data->>'clientCompanyName' END),
    updated_at=now()
  WHERE client_id=NEW.id AND company_id=NEW.company_id AND deleted_at IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_customer_billing_identity ON public.clients;
CREATE TRIGGER sync_customer_billing_identity AFTER UPDATE OF client_name, company_name ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_billing_identity();

REVOKE ALL ON FUNCTION public.fill_customer_billing_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_customer_billing_identity() FROM PUBLIC;
COMMIT;
