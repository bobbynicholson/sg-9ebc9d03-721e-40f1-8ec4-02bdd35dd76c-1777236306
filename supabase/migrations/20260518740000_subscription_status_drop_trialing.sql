-- A.13 #3 drift-sweep: drop the 'trialing' value from the
-- subscription_status enum so the DB enforces the same vocabulary
-- the application code has converged on.
--
-- Background: companies.subscription_status accepted both 'trial'
-- and 'trialing'. companyService.createCompany used to write
-- 'trialing' (Stripe convention) while every reader filtered on
-- 'trial'. The result: a new tenant signed up via that path would
-- never appear in the platform-dashboard trial-count KPIs.
--
-- The application-side bug is fixed in the same PR
-- (companyService now writes 'trial'). This migration closes the
-- loop by removing 'trialing' from the enum so a future regression
-- fails at the DB layer instead of silently writing an enum value
-- nothing else queries.
--
-- Postgres doesn't support DROP VALUE on enums. Rename + recreate +
-- retype + drop is the standard recipe. Three gotchas this migration
-- handles inline (each broke a previous attempt):
--   1. The column has a DEFAULT (`'trial'::subscription_status`) -
--      DROP it before retyping or ALTER TYPE refuses to cast.
--   2. The partial index `idx_companies_trial_expiry` had
--      `WHERE subscription_status = 'trial'::subscription_status`,
--      which pins the index to the renamed (old) type after the
--      rename. Drop and recreate the index against the new type.
--   3. Safe because no rows currently use 'trialing' (verified
--      pre-migration). The assertion guards against re-apply on a
--      DB that has regained 'trialing' rows.

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
    FROM companies c
   WHERE c.subscription_status::text = 'trialing';

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'cannot drop trialing from subscription_status enum - % rows still use it. UPDATE companies SET subscription_status=''trial'' WHERE subscription_status::text=''trialing'' first.',
      remaining;
  END IF;
END $$;

ALTER TABLE companies ALTER COLUMN subscription_status DROP DEFAULT;

-- Drop the partial index that pins the type before rename.
DROP INDEX IF EXISTS public.idx_companies_trial_expiry;

ALTER TYPE subscription_status RENAME TO subscription_status_old;

CREATE TYPE subscription_status AS ENUM (
  'trial',
  'active',
  'past_due',
  'cancelled',
  'suspended'
);

ALTER TABLE companies
  ALTER COLUMN subscription_status TYPE subscription_status
  USING subscription_status::text::subscription_status;

ALTER TABLE companies
  ALTER COLUMN subscription_status SET DEFAULT 'trial'::subscription_status;

-- Recreate the partial index against the new type. Same shape as
-- before the migration so any planner stats reset on its own.
CREATE INDEX idx_companies_trial_expiry
  ON public.companies USING btree (trial_ends_at)
  WHERE (subscription_status = 'trial'::subscription_status);

-- If subscriptions table also uses this enum, retype its column too.
-- (Schema check at audit time: subscriptions.status is TEXT with a
-- CHECK constraint, not the enum. Guard with a DO block in case
-- that changes in a future migration.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'subscriptions'
       AND column_name  = 'status'
       AND udt_name     = 'subscription_status_old'
  ) THEN
    ALTER TABLE subscriptions ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE subscriptions
      ALTER COLUMN status TYPE subscription_status
      USING status::text::subscription_status;
  END IF;
END $$;

DROP TYPE subscription_status_old;
