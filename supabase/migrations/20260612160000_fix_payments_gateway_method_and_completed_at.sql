-- FIX (2026-06-12): gateway payments (PayFast IPN) never recorded -
-- client pays, money moves, but the invoice/order never flips to paid.
--
-- Two schema mismatches in the payments INSERT done by both
-- record_order_payment (20260507130000) and record_invoice_payment
-- (20260514240000):
--
--   1. payments.payment_method is enum `payment_method`, whose values
--      are (cash, eft, card, credit_account, other). The webhook
--      records gateway payments with payment_method = 'payfast'
--      (also 'yoco' / 'stripe' for those providers), none of which
--      are valid enum members - the INSERT raised
--      "invalid input value for enum payment_method: payfast" and the
--      RPC threw, so the webhook 500'd / 404'd and the payment was
--      lost. Add the gateway provider names as valid enum values.
--
--   2. Both RPCs INSERT into payments.completed_at, which may not
--      exist on the live table. Add it idempotently (nullable) so the
--      INSERT column list resolves.
--
-- Both changes are additive + idempotent: existing rows and flows are
-- untouched, manual cash/eft/card captures keep working.

-- 1. Gateway provider names as payment methods.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'payfast';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'yoco';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'stripe';

-- 2. completed_at column the payment RPCs write to.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS completed_at timestamptz;

NOTIFY pgrst, 'reload schema';
