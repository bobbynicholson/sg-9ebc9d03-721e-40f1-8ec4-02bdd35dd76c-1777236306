-- Collection fees on quotes + orders.
--
-- The quote builder now has a "Collection Fees" block that mirrors the
-- Delivery block (distance x 2 x per-km), for jobs where the caterer
-- collects equipment / drop-back or the client collects from the kitchen.
-- It adds to the quote total alongside delivery_fee, so the order +
-- invoice that flow from the quote need the same columns to carry it.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS collection_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collection_distance_km numeric,
  ADD COLUMN IF NOT EXISTS collection_rate_per_km numeric;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS collection_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collection_distance_km numeric,
  ADD COLUMN IF NOT EXISTS collection_rate_per_km numeric;

COMMENT ON COLUMN public.quotes.collection_fee IS 'Collection fee (distance x 2 x per-km, or flat). Adds to total alongside delivery_fee.';
COMMENT ON COLUMN public.orders.collection_fee IS 'Collection fee carried over from the quote. Adds to total alongside delivery_fee.';
