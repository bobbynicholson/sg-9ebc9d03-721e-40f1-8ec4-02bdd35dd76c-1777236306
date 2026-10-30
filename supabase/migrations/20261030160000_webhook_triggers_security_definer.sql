-- Fix: sending a quote from the app left it as "draft" (lead page kept
-- showing "Finish quote"), seen on QUO-036193 and QUO-036195.
--
-- 20261029140000_company_rpc_and_view_boundaries revoked EXECUTE on
-- dispatch_webhook from authenticated users so it can't be called as an RPC.
-- These trigger functions call dispatch_webhook but ran as the signed-in
-- user (SECURITY INVOKER), so the browser's quote status update failed with
-- a permission error after the email had already gone out. The same applies
-- to lead create / lead status change and quote create when done from the
-- browser.
--
-- Run them as the function owner instead. Trigger functions cannot be called
-- directly ("trigger functions can only be called as triggers"), so this
-- does not reopen dispatch_webhook as an RPC. Bodies are unchanged from
-- 20260515310000_wave45_t1_legacy_functions_search_path.
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_quote_sent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status <> 'sent') THEN
    PERFORM dispatch_webhook(NEW.company_id, 'quote.sent', to_jsonb(NEW));
  ELSIF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    PERFORM dispatch_webhook(NEW.company_id, 'quote.accepted', to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_quote_created_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM dispatch_webhook(NEW.company_id, 'quote.created', to_jsonb(NEW));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_lead_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM dispatch_webhook(NEW.company_id, 'lead.created', to_jsonb(NEW));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_lead_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
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

COMMIT;
