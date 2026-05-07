-- P2-06: clear converted_to_order_id on the source quote when the
-- linked order is deleted, AND restore the quote's status so it isn't
-- frozen at 'accepted' with a broken pointer.
--
-- Today: quotes.converted_to_order_id has ON DELETE SET NULL. When an
-- order is hard-deleted (rare, but possible via admin tooling) the FK
-- nulls, but quote.status stays 'accepted'. Operators see a quote in
-- the "accepted" pipeline with no order to drill into -- looks like
-- a data corruption bug.
--
-- Add a BEFORE DELETE trigger on orders that, for each row about to
-- be deleted, finds the source quote (if any) and reverts its status
-- back to 'sent' alongside the SET NULL. Sent is the closest "we
-- gave it to them but didn't lock the deal" state; the operator can
-- re-accept against a new order if needed.
--
-- Soft-delete (UPDATE deleted_at) doesn't trigger this -- the FK
-- only fires on actual DELETE. Soft-deleted orders keep their
-- accepted-quote pointer, which is correct (you can recover).

CREATE OR REPLACE FUNCTION public.revert_quote_on_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.quote_id IS NOT NULL THEN
    UPDATE public.quotes
       SET status = 'sent'::public.quote_status,
           converted_to_order_id = NULL,
           updated_at = now()
     WHERE id = OLD.quote_id
       AND converted_to_order_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_quote_on_order_delete ON public.orders;
CREATE TRIGGER trg_revert_quote_on_order_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.revert_quote_on_order_delete();
