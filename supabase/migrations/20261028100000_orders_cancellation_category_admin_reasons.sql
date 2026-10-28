-- Allow the admin cancel reasons the app already offers.
--
-- The admin "Remove order" dialog and /api/orders/[id]/cancel accept
-- 'tenant_decision', 'client_dispute' and 'test_data' (TIGHTEN I.121),
-- but orders_cancellation_category_check (wave70_51a) was never widened,
-- so cancelling with one of those reasons failed with
-- "violates check constraint orders_cancellation_category_check".
--
-- Additive: the new CHECK keeps every previously allowed value and adds
-- the three admin reasons. Existing rows already satisfy it.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_cancellation_category_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_cancellation_category_check
  CHECK (
    cancellation_reason_category IS NULL OR
    cancellation_reason_category IN (
      'client_cancelled', 'no_payment', 'kitchen_capacity',
      'weather', 'force_majeure', 'venue_changed', 'duplicate',
      'package_cancelled', 'other',
      'tenant_decision', 'client_dispute', 'test_data'
    )
  );
