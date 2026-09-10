-- Phase 3 #4: persist the postOrderCreationCascade receipt on the
-- orders row so the admin detail panel can show what happened at
-- order-creation time (invoice generated? confirmation email sent?
-- kitchen prep tasks created? equipment bookings? shortfall alerts?
-- shopping suggestions?).
--
-- The receipt shape lives in src/services/order/postCreationCascade.ts
-- and is allowed to grow without a migration each time. JSONB is the
-- right home: the operator just needs to see the historical record,
-- not query it.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cascade_receipt JSONB NULL,
  ADD COLUMN IF NOT EXISTS cascade_receipt_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.orders.cascade_receipt IS
  'JSON receipt from postOrderCreationCascade: per-step ok/reason/details for invoice, email, kitchen prep, equipment bookings, conflict check, shopping suggestion. Surfaced on /admin/orders detail.';
COMMENT ON COLUMN public.orders.cascade_receipt_at IS
  'When the receipt was stamped. Distinct from created_at because the cascade can be re-run on retry.';
