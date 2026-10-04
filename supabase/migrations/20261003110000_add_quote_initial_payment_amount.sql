-- Preserve the first payment amount agreed on a quote so the same value
-- carries into the accepted order and the client's payment link.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS initial_payment_amount numeric(12, 2);
