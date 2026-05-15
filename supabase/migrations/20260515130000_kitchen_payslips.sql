-- Wave 36.3: kitchen_payslips persistence layer.
--
-- Driver-side payslips are ephemeral PDFs (generated then thrown
-- away). For kitchen we want a persistent record because:
--   * The team chef wants a "my payslips" history
--   * The catering company owner needs an audit trail for SARS / UIF
--   * Re-issuing the same period needs to land on the same row
--     (idempotency) instead of spawning duplicates
--
-- One row per (company_id, staff_id, period_start, period_end).
-- The payslip body lives in `breakdown` (jsonb) -- per-shift
-- breakdowns, multipliers, deductions for now -- so we can evolve
-- the shape without a schema change every time the operator wants
-- another column on the printout.

CREATE TABLE IF NOT EXISTS public.kitchen_payslips (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  staff_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  total_hours           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  base_pay              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  overtime_pay          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  multiplier_pay        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_pay             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  hourly_rate           NUMERIC(10, 2),
  currency              TEXT NOT NULL DEFAULT 'ZAR',
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  issued_at             TIMESTAMP WITH TIME ZONE,
  paid_at               TIMESTAMP WITH TIME ZONE,
  payment_reference     TEXT,
  breakdown             JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                 TEXT,
  created_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMP WITH TIME ZONE
);

-- Idempotent per (chef, period). Re-running the calc lands on the
-- same row instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_payslips_unique_period
  ON public.kitchen_payslips (company_id, staff_id, period_start, period_end)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS kitchen_payslips_period_idx
  ON public.kitchen_payslips (company_id, period_start DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER kitchen_payslips_updated_at
  BEFORE UPDATE ON public.kitchen_payslips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.kitchen_payslips ENABLE ROW LEVEL SECURITY;

-- Staff can read their own payslips. Admins can read everything in
-- their company. Super admins read everything.
CREATE POLICY kitchen_payslips_staff_select_own
  ON public.kitchen_payslips FOR SELECT
  USING (
    staff_id = auth.uid()
    OR company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Only admins write. Staff never insert/update/delete their own
-- payslip rows -- catastrophic for trust if they could.
CREATE POLICY kitchen_payslips_admin_write
  ON public.kitchen_payslips FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('company_admin', 'admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

COMMENT ON TABLE public.kitchen_payslips IS
  'Per-period payslip record for kitchen staff. Idempotent on (company, staff, period). breakdown jsonb carries per-shift detail for the printout.';
