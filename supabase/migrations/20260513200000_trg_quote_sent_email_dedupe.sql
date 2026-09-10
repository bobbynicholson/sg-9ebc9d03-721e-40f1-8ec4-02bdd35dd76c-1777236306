-- Flow audit Leg B P0-4: the trg_quote_sent_email trigger and the
-- in-app QuoteSendDialog can both fire a quote email for the same
-- send (tenants with auto_attach_on_quote_sent=true). Adds a
-- self-dedupe step inside the trigger -- skip if the
-- outgoing_email_queue already has a row tagged with this quote id
-- under trigger_event 'quote.sent', or if email_automation_log
-- shows a successful send for the same quote in the last 5 minutes
-- (the dialog path). Result: trigger now backstop-only.

CREATE OR REPLACE FUNCTION public.trg_quote_sent_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_settings RECORD;
  v_origin   text;
  v_history  integer;
  v_acc_token   jsonb;
  v_link     text;
  v_magic    text := NULL;
  v_subject  text;
  v_body     text;
  v_company  text;
  v_to       text;
  v_recent_send integer;
BEGIN
  IF NEW.status <> 'sent' OR (OLD.status IS NOT NULL AND OLD.status = 'sent') THEN
    RETURN NEW;
  END IF;

  SELECT auto_attach_on_quote_sent, magic_link_repeat_customers, magic_link_repeat_threshold
    INTO v_settings
    FROM email_provider_settings
    WHERE company_id = NEW.company_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  IF v_settings IS NULL OR NOT v_settings.auto_attach_on_quote_sent THEN
    RETURN NEW;
  END IF;

  v_to := COALESCE(NEW.client_email, '');
  IF v_to = '' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM outgoing_email_queue
    WHERE trigger_event = 'quote.sent'
      AND trigger_ref_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_recent_send
    FROM email_automation_log
   WHERE quote_id = NEW.id
     AND status = 'sent'
     AND created_at > now() - interval '5 minutes';
  IF v_recent_send > 0 THEN
    RETURN NEW;
  END IF;

  SELECT company_name INTO v_company FROM companies WHERE id = NEW.company_id;
  v_origin := public_origin();

  v_history := client_order_history_count(NEW.company_id, v_to);
  IF v_settings.magic_link_repeat_customers AND v_history >= v_settings.magic_link_repeat_threshold THEN
    v_acc_token := mint_client_account_token(NEW.company_id, v_to, 'auto-quote-magic');
    v_magic := v_origin || '/c/account?t=' || (v_acc_token->>'raw_token');
  END IF;

  v_subject := COALESCE(v_company, 'Catering') || ' - your quote is ready';
  v_body := 'Hi ' || COALESCE(NEW.client_name, 'there') || E'\n\n'
         || 'Your quote (' || NEW.quote_number || ') is ready: '
         || COALESCE(NEW.total_amount::text, '') || E'\n\n'
         || CASE WHEN v_magic IS NOT NULL THEN E'View all your bookings: ' || v_magic || E'\n\n' ELSE '' END
         || 'Reply with any tweaks or hit accept to lock the date.' || E'\n\n'
         || COALESCE(v_company, 'The team');

  INSERT INTO outgoing_email_queue
    (company_id, to_email, to_name, subject, body, magic_link, trigger_event, trigger_ref_id)
  VALUES
    (NEW.company_id, v_to, NEW.client_name, v_subject, v_body, v_magic, 'quote.sent', NEW.id);

  RETURN NEW;
END $function$;
