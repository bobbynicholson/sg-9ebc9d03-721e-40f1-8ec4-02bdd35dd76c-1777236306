-- "Equipment return" choice on quotes: who brings the equipment back.
--
-- Values (src/lib/equipmentReturn.ts):
--   driver_same_day  - our driver collects after the event (collection trip)
--   driver_next_day  - our driver collects the next morning (collection trip)
--   waiter           - the waiter on the job brings it back (no trip)
--   none             - client returns it / nothing to return (no trip)
--
-- Copied to orders.equipment_return_method (column already exists, it was
-- just never set) when the quote converts, and kept in sync on quote
-- edits. NULL = chosen before this field existed; the app then keeps the
-- old guess (waiter on the job -> waiter, else driver collection).
--
-- Idempotent - safe to run repeatedly.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS equipment_return_method text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS equipment_return_method text;

COMMENT ON COLUMN public.quotes.equipment_return_method IS
  'Who brings equipment back: driver_same_day | driver_next_day | waiter | none. NULL = legacy (inferred).';
COMMENT ON COLUMN public.orders.equipment_return_method IS
  'Who brings equipment back: driver_same_day | driver_next_day | waiter | none. NULL = legacy (inferred).';
