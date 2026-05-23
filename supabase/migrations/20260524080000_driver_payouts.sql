-- DRV-B (driver-settlement deferred, 2026-05-24): payout state
-- machine for /admin/driver-settlement.
--
-- Pre-DRV-B the settlement page computed live totals every load but
-- had nowhere to mark "we actually paid this out". The hero copy
-- read "Review here before triggering payout" but no payout button
-- existed. This migration adds the backing table so a settlement
-- can be moved through Draft -> Reviewed -> Paid with a snapshot
-- of the totals at the moment of marking, plus the payout method,
-- reference, and the manager who recorded it.
--
-- Schema:
--   driver_payouts.status          'draft' | 'reviewed' | 'paid'
--   period_from / period_to        the settlement window (inclusive)
--   gross_total / hourly_pay /     totals snapshot at the moment the
--   distance_pay / callout_pay     settlement was marked. We store
--                                  rather than recompute so a driver
--                                  rate change next month doesn't
--                                  rewrite history.
--   paid_at, paid_method,          set when status flips to 'paid'.
--   paid_reference                 method = 'eft' | 'cash' |
--                                  'mobile_money' | 'other'.
--   created_by_user_id /           audit trail. RLS already restricts
--   reviewed_by_user_id /          who can read this table by company.
--   paid_by_user_id
--
-- Uniqueness: a single (driver_id, period_from, period_to) tuple
-- can only have one open settlement at a time. Re-marking after a
-- soft-delete uses the deleted_at IS NULL partial unique index so
-- a corrected payout can be recorded without colliding with the
-- one that was reversed.
--
-- audit_logs row inserts are handled by the service layer (the
-- driverPayoutService) so the entry_reason + before/after snapshot
-- can be richer than what a trigger could build.

CREATE TABLE IF NOT EXISTS public.driver_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'draft',

  period_from date NOT NULL,
  period_to date NOT NULL,

  -- Totals snapshot at status transition. All ZAR, two-decimal
  -- precision. hours_total stays separate from rand totals so the
  -- payslip can render h + R side by side without redoing the calc.
  hours_total numeric(10, 2) NOT NULL DEFAULT 0,
  hourly_pay numeric(12, 2) NOT NULL DEFAULT 0,
  distance_total_km numeric(10, 2) NOT NULL DEFAULT 0,
  distance_pay numeric(12, 2) NOT NULL DEFAULT 0,
  callout_pay numeric(12, 2) NOT NULL DEFAULT 0,
  gross_total numeric(12, 2) NOT NULL DEFAULT 0,

  -- Payment details. Populated only when status = 'paid'.
  paid_at timestamptz,
  paid_method text,
  paid_reference text,
  paid_notes text,

  -- Audit trail. Each timestamp is set as the settlement moves
  -- through the state machine; the matching user_id captures who
  -- did it. NULL on phases that haven't happened yet.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT driver_payouts_status_chk
    CHECK (status IN ('draft', 'reviewed', 'paid')),
  CONSTRAINT driver_payouts_method_chk
    CHECK (
      paid_method IS NULL OR paid_method IN ('eft', 'cash', 'mobile_money', 'other')
    ),
  CONSTRAINT driver_payouts_period_chk
    CHECK (period_to >= period_from),
  CONSTRAINT driver_payouts_paid_consistency_chk
    CHECK (
      (status <> 'paid') OR (paid_at IS NOT NULL AND paid_method IS NOT NULL)
    )
);

-- One live settlement per (driver, period). Soft-deleted rows are
-- excluded so a reversal-and-re-record cycle works.
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_payouts_driver_period_live
  ON public.driver_payouts (driver_id, period_from, period_to)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_payouts_company_status
  ON public.driver_payouts (company_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_payouts_company_period
  ON public.driver_payouts (company_id, period_from, period_to)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver_paid_at
  ON public.driver_payouts (driver_id, paid_at DESC)
  WHERE status = 'paid' AND deleted_at IS NULL;

-- updated_at maintenance trigger. Matches the pattern used on every
-- other table with this column (kitchen_staff_shifts, fixed_costs).
CREATE OR REPLACE FUNCTION public.set_driver_payouts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_payouts_updated_at ON public.driver_payouts;
CREATE TRIGGER trg_driver_payouts_updated_at
  BEFORE UPDATE ON public.driver_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_driver_payouts_updated_at();

-- RLS. Same model every other money-bearing table uses: the
-- session's company_id must match the row. Inserts/updates also
-- enforce company match via WITH CHECK so the API can't sidestep.
ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_payouts_select ON public.driver_payouts;
CREATE POLICY driver_payouts_select
  ON public.driver_payouts
  FOR SELECT
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS driver_payouts_insert ON public.driver_payouts;
CREATE POLICY driver_payouts_insert
  ON public.driver_payouts
  FOR INSERT
  WITH CHECK (
    company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS driver_payouts_update ON public.driver_payouts;
CREATE POLICY driver_payouts_update
  ON public.driver_payouts
  FOR UPDATE
  USING (
    company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id = (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE public.driver_payouts IS
  'DRV-B: per-driver settlement state machine (draft -> reviewed -> paid). One live row per (driver, period_from, period_to). Snapshot of totals captured at the moment of recording so future rate changes do not rewrite history.';

COMMENT ON COLUMN public.driver_payouts.status IS
  'DRV-B: draft (operator opened the settlement), reviewed (totals signed off), paid (money out of the door). Forward-only by service-layer convention; reversal = soft-delete.';

COMMENT ON COLUMN public.driver_payouts.paid_method IS
  'DRV-B: eft / cash / mobile_money / other. Required when status flips to paid.';
