-- Quote conversion passes every orders column through jsonb_populate_record.
-- Missing JSON keys therefore become explicit NULLs and bypass the column
-- DEFAULT, which previously made quote acceptance fail after
-- payment_opening_paid became NOT NULL.
BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_opening_paid numeric(12,2);

UPDATE public.orders
SET payment_opening_paid = 0
WHERE payment_opening_paid IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN payment_opening_paid SET DEFAULT 0,
  ALTER COLUMN payment_opening_paid SET NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_order_opening_paid_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.payment_opening_paid := COALESCE(NEW.payment_opening_paid, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_opening_paid_default ON public.orders;
CREATE TRIGGER orders_opening_paid_default
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_order_opening_paid_default();

COMMIT;
