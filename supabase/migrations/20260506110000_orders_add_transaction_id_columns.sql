-- Phase 2 consolidation: kill the parallel payment_schedules table.
-- orders already carries deposit_amount, deposit_paid, deposit_paid_at,
-- balance_amount, balance_paid, balance_paid_at, balance_due_date,
-- final_order_change_date, event_date, total_amount, currency and
-- deposit_percentage. The only deposit/balance fields not yet on
-- orders are the gateway transaction ids.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deposit_transaction_id text,
  ADD COLUMN IF NOT EXISTS balance_transaction_id text;
