-- staff-hours load was 400ing because paymentLedgerService writes/
-- reads against columns that never existed on staff_payment_ledger.
-- The table shipped (20260425113850) as a session-mirror (clock_in /
-- clock_out / total_earnings / session_date) but the service was
-- built against a proper payment-ledger shape (payment_period_start
-- / payment_period_end / payment_method / payment_reference /
-- payment_date / notes / total_amount). The `as any` cast in
-- recordPayment hid the schema drift, so it silently 400'd until
-- the load actually fetched + the inline join `staff:profiles!
-- staff_payment_ledger_staff_id_fkey(...)` failed because the
-- constraint was missing too.
--
-- Adds the missing columns + the FK constraint named
-- staff_payment_ledger_staff_id_fkey on staff_id -> profiles(id)
-- so the PostgREST embed resolves.

ALTER TABLE public.staff_payment_ledger
  ADD COLUMN IF NOT EXISTS payment_period_start date,
  ADD COLUMN IF NOT EXISTS payment_period_end   date,
  ADD COLUMN IF NOT EXISTS total_amount         numeric(10, 2),
  ADD COLUMN IF NOT EXISTS payment_method       text,
  ADD COLUMN IF NOT EXISTS payment_reference    text,
  ADD COLUMN IF NOT EXISTS payment_date         timestamptz,
  ADD COLUMN IF NOT EXISTS notes                text;

UPDATE public.staff_payment_ledger
SET    total_amount = COALESCE(total_amount, total_earnings)
WHERE  total_amount IS NULL
  AND  total_earnings IS NOT NULL;

UPDATE public.staff_payment_ledger
SET    payment_date = COALESCE(payment_date, updated_at, created_at)
WHERE  payment_date IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_payment_ledger_method_check'
      AND conrelid = 'public.staff_payment_ledger'::regclass
  ) THEN
    ALTER TABLE public.staff_payment_ledger
      ADD CONSTRAINT staff_payment_ledger_method_check
      CHECK (payment_method IS NULL OR payment_method IN ('cash','bank_transfer','eft','other'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_payment_ledger_staff_id_fkey'
      AND conrelid = 'public.staff_payment_ledger'::regclass
  ) THEN
    ALTER TABLE public.staff_payment_ledger
      ADD CONSTRAINT staff_payment_ledger_staff_id_fkey
      FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_payment_ledger_payment_date
  ON public.staff_payment_ledger (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_payment_ledger_period
  ON public.staff_payment_ledger (payment_period_start, payment_period_end);

COMMENT ON COLUMN public.staff_payment_ledger.payment_period_start IS
  'Inclusive start date of the wage period this payment covers. Used by getAllPayments + getStaffPayments to bound the query.';
COMMENT ON COLUMN public.staff_payment_ledger.payment_period_end IS
  'Inclusive end date of the wage period this payment covers.';
COMMENT ON COLUMN public.staff_payment_ledger.total_amount IS
  'Rand value paid. Distinct from total_earnings (the session-derived figure) to allow round-ups and manual adjustments at payment time.';
COMMENT ON COLUMN public.staff_payment_ledger.payment_method IS
  'cash | bank_transfer | eft | other. Constrained by staff_payment_ledger_method_check.';
COMMENT ON COLUMN public.staff_payment_ledger.payment_reference IS
  'Bank ref / receipt number for the payout. Free-text.';
COMMENT ON COLUMN public.staff_payment_ledger.payment_date IS
  'When the money actually moved. Used as the sort key in the Payment Ledger tab.';
