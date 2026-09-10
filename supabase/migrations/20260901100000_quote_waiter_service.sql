-- Quote-stage waiter service.  The client can request service before
-- accepting a quote; the approved pricing is carried into the order so the
-- admin can assign a real waiter after acceptance.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS waiter_service_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waiter_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS waiter_duration_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS waiter_hourly_rate numeric(12,2),
  ADD COLUMN IF NOT EXISTS waiter_total_fee numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS quotes_waiter_count_check,
  ADD CONSTRAINT quotes_waiter_count_check CHECK (waiter_count BETWEEN 1 AND 50),
  DROP CONSTRAINT IF EXISTS quotes_waiter_duration_hours_check,
  ADD CONSTRAINT quotes_waiter_duration_hours_check CHECK (waiter_duration_hours IS NULL OR waiter_duration_hours > 0),
  DROP CONSTRAINT IF EXISTS quotes_waiter_hourly_rate_check,
  ADD CONSTRAINT quotes_waiter_hourly_rate_check CHECK (waiter_hourly_rate IS NULL OR waiter_hourly_rate >= 0),
  DROP CONSTRAINT IF EXISTS quotes_waiter_total_fee_check,
  ADD CONSTRAINT quotes_waiter_total_fee_check CHECK (waiter_total_fee >= 0);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS waiter_count integer NOT NULL DEFAULT 1;

-- Existing order waiter fields were introduced as integer / numeric(10,2).
-- Keep the same precision as quote pricing so half-hour shifts and larger
-- tenant rates survive quote acceptance and later resyncs.
ALTER TABLE public.orders
  ALTER COLUMN waiter_duration_hours TYPE numeric(6,2)
    USING waiter_duration_hours::numeric,
  ALTER COLUMN waiter_hourly_rate TYPE numeric(12,2)
    USING waiter_hourly_rate::numeric,
  ALTER COLUMN waiter_total_fee TYPE numeric(12,2)
    USING waiter_total_fee::numeric;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_waiter_duration_hours_check,
  ADD CONSTRAINT orders_waiter_duration_hours_check
    CHECK (waiter_duration_hours IS NULL OR waiter_duration_hours > 0),
  DROP CONSTRAINT IF EXISTS orders_waiter_hourly_rate_check,
  ADD CONSTRAINT orders_waiter_hourly_rate_check
    CHECK (waiter_hourly_rate IS NULL OR waiter_hourly_rate >= 0),
  DROP CONSTRAINT IF EXISTS orders_waiter_total_fee_check,
  ADD CONSTRAINT orders_waiter_total_fee_check
    CHECK (waiter_total_fee >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_waiter_count_check,
  ADD CONSTRAINT orders_waiter_count_check CHECK (waiter_count BETWEEN 1 AND 50);

COMMENT ON COLUMN public.quotes.waiter_service_required IS 'Client-approved on-site waiter/service requirement for this quote.';
COMMENT ON COLUMN public.quotes.waiter_total_fee IS 'Agreed waiter service fee included in the quote total.';
