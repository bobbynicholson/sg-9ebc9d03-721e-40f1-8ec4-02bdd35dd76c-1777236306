-- Add delivery_fee column to quotes so the new-quote screen can persist
-- the delivery line item separately from the menu / equipment subtotal.
-- The orders table already had this column; quotes did not, which is what
-- triggered the "Could not find the 'delivery_fee' column of 'quotes' in
-- the schema cache" error from PostgREST when saving a quote.
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.quotes.delivery_fee IS 'Delivery fee charged on this quote (separate line item from menu/equipment subtotal). Folded into total_amount but kept addressable for reporting and conversion to orders.';
