-- CASH-B (cashflow dashboard follow-ups): per-tenant stale-threshold.
--
-- PR #312 widened the hardcoded "Cash on hand is stale" threshold from
-- 24h to 72h to match a typical Mon/Wed/Fri bookkeeper rhythm. But the
-- right number is per-tenant: a daily-reconciliation kitchen wants the
-- badge to fire after 36h, a once-a-week back-office is fine with
-- 144h. New column carries the override.
--
-- NULL = "use the 72h default in CashflowForecastCard". Range capped at
-- 30 days so a typo can't permanently suppress the staleness signal.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS cash_on_hand_stale_after_hours INTEGER;

ALTER TABLE companies
  ADD CONSTRAINT companies_cash_on_hand_stale_after_hours_range
    CHECK (cash_on_hand_stale_after_hours IS NULL OR (cash_on_hand_stale_after_hours BETWEEN 1 AND 720));

COMMENT ON COLUMN companies.cash_on_hand_stale_after_hours IS
  'CASH-B: per-tenant override for the CashflowForecastCard Stale badge threshold. Hours since cash_on_hand_updated_at before the badge fires. NULL falls back to a 72h default (Mon/Wed/Fri reconciliation rhythm). Capped at 720h = 30d.';
