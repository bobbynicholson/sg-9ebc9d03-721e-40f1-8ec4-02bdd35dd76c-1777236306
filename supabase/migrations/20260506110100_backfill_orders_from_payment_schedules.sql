-- One-time backfill from payment_schedules into orders for any field
-- still NULL on orders that has data on the schedule. Idempotent
-- (COALESCE preserves existing orders values), so safe to re-run.
UPDATE public.orders o
SET
  deposit_amount = COALESCE(o.deposit_amount, ps.deposit_amount),
  deposit_percentage = COALESCE(o.deposit_percentage, ps.deposit_percentage),
  deposit_paid = COALESCE(o.deposit_paid, ps.deposit_paid),
  deposit_paid_at = COALESCE(o.deposit_paid_at, ps.deposit_paid_at),
  deposit_transaction_id = COALESCE(o.deposit_transaction_id, ps.deposit_transaction_id),
  balance_amount = COALESCE(o.balance_amount, ps.balance_amount),
  balance_paid = COALESCE(o.balance_paid, ps.balance_paid),
  balance_paid_at = COALESCE(o.balance_paid_at, ps.balance_paid_at),
  balance_transaction_id = COALESCE(o.balance_transaction_id, ps.balance_transaction_id),
  balance_due_date = COALESCE(o.balance_due_date, ps.balance_due_date),
  final_order_change_date = COALESCE(o.final_order_change_date, ps.final_order_change_date),
  total_amount = COALESCE(o.total_amount, ps.total_amount),
  currency = COALESCE(o.currency, ps.currency)
FROM public.payment_schedules ps
WHERE ps.order_id = o.id;
