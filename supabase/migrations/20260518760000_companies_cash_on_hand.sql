-- Cashflow Forecast Card (post-audit feature, scoped on
-- /admin/platform/running-todo "Cashflow Forecast Card on
-- /admin/financial-dashboard"). Owner types in the current bank
-- balance once a day; the forecast card combines it with the
-- existing 30/60/90-day projection + scheduled costs to produce
-- a forward-looking cashflow read.
--
-- Stored in cents (integer) per the standard practice for money
-- fields in this codebase - avoids float drift on the running
-- balance maths. Currency is implied by companies.currency /
-- companies.billing_currency; this field carries the value only.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cash_on_hand_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_on_hand_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS cash_on_hand_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.companies.cash_on_hand_cents IS
  'Owner-entered current bank balance, in cents of the company currency. Typed in daily from the bank app. Visible only to owner / company_admin / super_admin roles per the finance-visibility rule. Drives the Cashflow Forecast Card on /admin/financial-dashboard.';

COMMENT ON COLUMN public.companies.cash_on_hand_updated_at IS
  'When cash_on_hand_cents was last set. UI shows a stale-data warning if older than 24h.';

COMMENT ON COLUMN public.companies.cash_on_hand_updated_by IS
  'Which user typed in the most recent cash_on_hand_cents value. Audit trail for the daily-balance entry.';
