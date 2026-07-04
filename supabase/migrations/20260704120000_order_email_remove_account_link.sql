-- Remove the second ("See all your past + upcoming bookings") account/magic
-- link from the booking-confirmed + status-update customer emails.
--
-- Rationale (Raj, 2026-07-04): the /c/account?t=acc_... magic link is broken
-- (the acc_ token fails validation) AND unwanted -- customers should not need
-- login credentials. The only link in these emails should be the token-gated
-- "View / track / pay" order link, which works.
--
-- This CREATE OR REPLACE keeps trg_order_email byte-for-byte identical to the
-- live prod definition EXCEPT: the repeat-customer magic-link block is gone,
-- the body no longer appends the second link, and the queue insert always
-- writes magic_link = NULL.
CREATE OR REPLACE FUNCTION public.trg_order_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_settings RECORD;
  v_origin   text;
  v_order_token jsonb;
  v_link     text;
  v_subject  text;
  v_body     text;
  v_company  text;
  v_to       text;
  v_event    text;
BEGIN
  v_to := COALESCE(NEW.client_email, '');
  IF v_to = '' OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Decide which event we're handling
  IF TG_OP = 'INSERT' THEN
    v_event := 'order.created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := 'order.status_changed';
  ELSE
    RETURN NEW;
  END IF;

  SELECT auto_attach_on_order_confirmed, auto_attach_on_order_status_change,
         magic_link_repeat_customers, magic_link_repeat_threshold
    INTO v_settings
    FROM email_provider_settings
    WHERE company_id = NEW.company_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

  IF v_settings IS NULL THEN RETURN NEW; END IF;

  IF v_event = 'order.created' AND NOT v_settings.auto_attach_on_order_confirmed THEN
    RETURN NEW;
  END IF;
  IF v_event = 'order.status_changed' AND NOT v_settings.auto_attach_on_order_status_change THEN
    RETURN NEW;
  END IF;

  SELECT company_name INTO v_company FROM companies WHERE id = NEW.company_id;
  v_origin := public_origin();

  v_order_token := mint_client_order_token(NEW.company_id, NEW.id, 'auto-' || v_event);
  v_link := v_origin || '/c/order/' || NEW.id || '?t=' || (v_order_token->>'raw_token');

  -- NOTE: the repeat-customer account/magic link has been intentionally
  -- removed. The order link above is the only customer-facing link.

  v_subject := CASE v_event
    WHEN 'order.created'        THEN COALESCE(v_company, 'Catering') || ' - booking confirmed: ' || NEW.order_number
    WHEN 'order.status_changed' THEN COALESCE(v_company, 'Catering') || ' - update on ' || NEW.order_number || ' (' || NEW.status || ')'
  END;

  v_body := 'Hi ' || COALESCE(NEW.client_name, 'there') || E',\n\n'
         || CASE v_event
              WHEN 'order.created'        THEN 'Your booking ' || NEW.order_number || ' is locked in for '
                                              || to_char(NEW.event_date, 'FMDay, FMDD FMMonth YYYY') || '.'
              WHEN 'order.status_changed' THEN 'Your booking ' || NEW.order_number || ' is now: ' || NEW.status || '.'
            END
         || E'\n\n'
         || 'View / track / pay here: ' || v_link || E'\n\n'
         || COALESCE(v_company, 'The team');

  INSERT INTO outgoing_email_queue
    (company_id, to_email, to_name, subject, body, client_link, magic_link, trigger_event, trigger_ref_id)
  VALUES
    (NEW.company_id, v_to, NEW.client_name, v_subject, v_body, v_link, NULL, v_event, NEW.id);

  -- If revoke_old_links_on_new is set, kill any older 'order' tokens
  -- for this same order
  PERFORM 1 FROM email_provider_settings
   WHERE company_id = NEW.company_id AND revoke_old_links_on_new = true
   LIMIT 1;
  IF FOUND THEN
    UPDATE client_access_tokens
       SET revoked_at = now()
     WHERE order_id = NEW.id
       AND id <> (v_order_token->>'id')::uuid
       AND revoked_at IS NULL;
  END IF;

  RETURN NEW;
END $function$;
