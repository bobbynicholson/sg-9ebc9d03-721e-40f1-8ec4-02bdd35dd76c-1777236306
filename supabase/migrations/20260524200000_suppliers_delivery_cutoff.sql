-- SHOP-L (shopping tabs deferred, 2026-05-24): per-supplier order
-- cutoff. Operators kept missing same-day delivery windows because
-- there's no record of "order before 14:00 Mon-Fri or it ships
-- tomorrow". The By-supplier tab now reads these to show a "Order
-- by HH:MM today / tomorrow" chip.
--
-- delivery_cutoff_time time of day (supplier's local time, assumed
--   Africa/Johannesburg). NULL means no known cutoff.
-- delivery_cutoff_days int[] of weekday indices the supplier
--   accepts orders on (0=Sun ... 6=Sat). NULL means every day.
--   Stored as int[] because operators often have a Mon-Fri 14:00
--   cutoff with no Sat/Sun deliveries at all.
-- delivery_lead_time_days int. 0 = same day if before cutoff; 1 =
--   next day if before cutoff. The chip combines the two.
--
-- All nullable so this is a soft enhancement - suppliers without
-- the data behave exactly as before.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS delivery_cutoff_time time,
  ADD COLUMN IF NOT EXISTS delivery_cutoff_days int[],
  ADD COLUMN IF NOT EXISTS delivery_lead_time_days int;

COMMENT ON COLUMN public.suppliers.delivery_cutoff_time IS
  'SHOP-L: supplier-local time of day (assumed Africa/Johannesburg) after which orders ship the next operating day. NULL = unknown.';
COMMENT ON COLUMN public.suppliers.delivery_cutoff_days IS
  'SHOP-L: weekday indices (0=Sun ... 6=Sat) the supplier accepts orders on. NULL = every day. Used to skip weekends in the cutoff chip.';
COMMENT ON COLUMN public.suppliers.delivery_lead_time_days IS
  'SHOP-L: business days between order and delivery if placed before cutoff. 0 = same day. NULL = unknown.';
