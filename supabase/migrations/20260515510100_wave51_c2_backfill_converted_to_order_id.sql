-- Wave 51 C2 -- backfill quotes.converted_to_order_id where it's
-- null but orders.quote_id correctly back-links + add trigger to
-- prevent future drift from non-RPC paths.

UPDATE public.quotes q
SET converted_to_order_id = o.id,
    updated_at            = NOW()
FROM public.orders o
WHERE o.quote_id = q.id
  AND o.deleted_at IS NULL
  AND q.converted_to_order_id IS NULL;

CREATE OR REPLACE FUNCTION public.tg_stamp_quote_converted_to_order_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_id IS NOT NULL THEN
    UPDATE public.quotes
    SET converted_to_order_id = NEW.id,
        updated_at = NOW()
    WHERE id = NEW.quote_id
      AND converted_to_order_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_stamp_quote_link ON public.orders;
CREATE TRIGGER trg_orders_stamp_quote_link
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_stamp_quote_converted_to_order_id();

COMMENT ON FUNCTION public.tg_stamp_quote_converted_to_order_id() IS
  'Wave 51 C2 -- safety net for orders inserted via paths that bypass convert_quote_to_order RPC. Stamps the forward link automatically when the back link is set and the forward link is null.';
