-- Wave 45 Tier 1 -- pin SET search_path on the remaining 24
-- pre-Wave-41 functions flagged by function_search_path_mutable.
--
-- Bodies preserved verbatim (LANGUAGE / VOLATILITY / SECURITY
-- attributes all kept as-is). Only addition is the explicit SET
-- search_path = public, pg_temp clause -- prevents same-name
-- shadow-attack via session search_path.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_inventory_batches()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      role::text IN ('admin','super_admin','company_admin')
      OR active_role IN ('owner','admin','super_admin','company_admin')
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.trg_lead_created()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM dispatch_webhook(NEW.company_id, 'lead.created', to_jsonb(NEW));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.companies_enforce_slug_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
begin
  if (tg_op = 'INSERT') then
    if new.slug is null or length(trim(new.slug)) = 0 then
      raise exception 'company slug is required';
    end if;
    new.slug := lower(trim(new.slug));
    if new.slug !~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$' then
      raise exception
        'invalid slug %: must be 1-80 chars, lowercase a-z, 0-9, hyphens; cannot start or end with a hyphen',
        new.slug;
    end if;
    if new.slug = any (array[
      'admin', 'api', 'auth', 'blog', 'c', 'client', 'client-portal',
      'company-signup', 'contact', 'demo', 'features', 'pay', 'page',
      'pricing', 'privacy', 'security', 'super-admin', 'support',
      'team-portal', 'terms', 'uk', 'us', 'subscription', 'account',
      '_next', 'static', 'public', 'assets', 'favicon.ico'
    ]) then
      raise exception 'slug % is reserved -- pick a different one for your company URL', new.slug;
    end if;
    return new;
  end if;
  if (tg_op = 'UPDATE') then
    if old.slug is distinct from new.slug then
      if lower(trim(coalesce(new.slug, ''))) = old.slug then
        new.slug := old.slug;
      else
        raise exception 'company slug is immutable -- cannot change from % to %', old.slug, new.slug;
      end if;
    end if;
    return new;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_quote_change_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.public_origin()
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $function$ SELECT value FROM app_config WHERE key = 'public_origin' LIMIT 1 $function$;

CREATE OR REPLACE FUNCTION public.trg_orders_bump_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.order_number IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    PERFORM public.bump_number_settings_on_insert('order', NEW.order_number, NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at_payment_gateway()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.audit_payment_gateway_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
DECLARE
  actor uuid := auth.uid();
  changed jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (
      NEW.company_id, actor, 'payment_gateway.created', 'payment_gateway', NEW.id,
      jsonb_build_object('provider', NEW.provider, 'is_test', NEW.is_test, 'is_active', NEW.is_active)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      changed = changed || jsonb_build_object('is_active', jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active));
    END IF;
    IF NEW.is_test IS DISTINCT FROM OLD.is_test THEN
      changed = changed || jsonb_build_object('is_test', jsonb_build_object('from', OLD.is_test, 'to', NEW.is_test));
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      changed = changed || jsonb_build_object('deleted_at', jsonb_build_object('from', OLD.deleted_at, 'to', NEW.deleted_at));
    END IF;
    IF NEW.success_url IS DISTINCT FROM OLD.success_url
       OR NEW.cancel_url IS DISTINCT FROM OLD.cancel_url
       OR NEW.notify_url IS DISTINCT FROM OLD.notify_url THEN
      changed = changed || jsonb_build_object('urls_updated', true);
    END IF;
    IF changed = '{}'::jsonb THEN RETURN NEW; END IF;
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    VALUES (
      NEW.company_id, actor, 'payment_gateway.updated', 'payment_gateway', NEW.id,
      jsonb_build_object('provider', NEW.provider, 'changes', changed)
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_kitchen_prep_tasks()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.cms_parse_doc_seq(p_number text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp
AS $function$
DECLARE m text[]; v bigint;
BEGIN
  IF p_number IS NULL THEN RETURN 0; END IF;
  m := regexp_match(p_number, '(\d+)$');
  IF m IS NULL THEN RETURN 0; END IF;
  BEGIN v := m[1]::bigint; EXCEPTION WHEN OTHERS THEN RETURN 0; END;
  IF v < 1 OR v > 2147483646 THEN RETURN 0; END IF;
  RETURN v::int;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_import_jobs_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ begin new.updated_at := now(); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.trg_quotes_bump_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.quote_number IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    PERFORM public.bump_number_settings_on_insert('quote', NEW.quote_number, NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_lead_status_changed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM dispatch_webhook(NEW.company_id, 'lead.status_changed', jsonb_build_object(
      'lead', to_jsonb(NEW),
      'previous_status', OLD.status,
      'new_status', NEW.status
    ));
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$ SELECT company_id FROM public.profiles WHERE id = auth.uid() $function$;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_vehicles()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.trg_quote_sent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status <> 'sent') THEN
    PERFORM dispatch_webhook(NEW.company_id, 'quote.sent', to_jsonb(NEW));
  ELSIF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    PERFORM dispatch_webhook(NEW.company_id, 'quote.accepted', to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_invoices_bump_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    PERFORM public.bump_number_settings_on_insert('invoice', NEW.invoice_number, NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_quote_created_webhook()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM dispatch_webhook(NEW.company_id, 'quote.created', to_jsonb(NEW));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_geofence_auto_arrived()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  arrival_radius_m CONSTANT NUMERIC := 150;
  R                CONSTANT NUMERIC := 6371000;
  o                RECORD;
  d_meters         NUMERIC;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL OR NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;
  FOR o IN
    SELECT o2.id, o2.company_id, o2.venue_lat, o2.venue_lng
    FROM public.orders o2
    WHERE o2.driver_id = NEW.driver_id
      AND o2.status IN ('out_for_delivery', 'in_transit', 'ready', 'preparing')
      AND o2.venue_lat IS NOT NULL
      AND o2.venue_lng IS NOT NULL
  LOOP
    d_meters := 2 * R * ASIN(SQRT(
      POWER(SIN(RADIANS(o.venue_lat - NEW.latitude) / 2), 2) +
      COS(RADIANS(NEW.latitude)) * COS(RADIANS(o.venue_lat)) *
      POWER(SIN(RADIANS(o.venue_lng - NEW.longitude) / 2), 2)
    ));
    IF d_meters <= arrival_radius_m THEN
      UPDATE public.driver_assignments
      SET arrived_at_venue_at = COALESCE(arrived_at_venue_at, NOW()), updated_at = NOW()
      WHERE order_id = o.id AND driver_id = NEW.driver_id AND arrived_at_venue_at IS NULL;
      INSERT INTO public.driver_confirmations (
        driver_id, order_id, confirmation_type, confirmed_at, location_lat, location_lng
      )
      SELECT NEW.driver_id, o.id, 'at_venue', NOW(), NEW.latitude, NEW.longitude
      WHERE NOT EXISTS (
        SELECT 1 FROM public.driver_confirmations dc
        WHERE dc.order_id = o.id AND dc.driver_id = NEW.driver_id AND dc.confirmation_type = 'at_venue'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_eho_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ begin new.updated_at := now(); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.client_order_history_count(p_company_id uuid, p_email text)
RETURNS integer LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $function$
  SELECT COUNT(*)::integer
  FROM orders
  WHERE company_id = p_company_id
    AND lower(client_email) = lower(p_email)
    AND status <> 'cancelled'
    AND deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_kitchen_stations()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$;
