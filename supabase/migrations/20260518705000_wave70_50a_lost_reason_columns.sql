-- Wave 70.50a -- structured lost-reason capture on quotes + leads.
--
-- Audit gap: when a quote is rejected (client decline OR admin mark-lost
-- OR order cancelled), the reason was free-text buried in quotes.notes.
-- No aggregable categorisation. Sales managers couldn't answer "are
-- we losing on price vs timing vs capacity?" without manually reading
-- every quote's notes. Conversion funnel had no way to bucket
-- "won-then-cancelled" separately from "never accepted".
--
-- This migration adds structured columns so the next round of pipeline
-- correctness work (Wave 70.50b funnel + Wave 70.51 reporting) has
-- somewhere to read aggregable data from.
--
-- Backwards compatibility: every column is nullable + no default. Old
-- rows keep their NULL until the next status flip writes a value via
-- the helper.

-- ── 1. lost_reason enum (shared by quotes + leads) ──────────────────
DO $$ BEGIN
  CREATE TYPE public.lost_reason AS ENUM (
    'price',              -- client found a cheaper option
    'timing',             -- we couldn't deliver on the date they wanted
    'capacity',           -- kitchen/equipment/driver couldn't handle it
    'weather',            -- event cancelled due to weather (no-fault)
    'force_majeure',      -- act of god / lockdown / etc. (no-fault)
    'no_response',        -- client ghosted us (the most common one)
    'won_by_competitor',  -- they picked another caterer (specific to price)
    'client_changed_plans', -- they no longer need catering at all
    'order_cancelled',    -- we won the quote, then the order got cancelled
    'other'               -- unstructured -- explanation lives in notes
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. quotes additions ─────────────────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS lost_reason public.lost_reason,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

COMMENT ON COLUMN public.quotes.lost_reason IS
  'Wave 70.50 -- structured loss categorisation. Set when status flips to rejected/expired. NULL on still-live quotes.';
COMMENT ON COLUMN public.quotes.rejected_at IS
  'Wave 70.50 -- timestamp when quote was rejected/expired. Distinct from updated_at so the funnel can count rejections-per-period without re-reading every status_history row.';

-- ── 3. leads additions ──────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason public.lost_reason,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;

COMMENT ON COLUMN public.leads.lost_reason IS
  'Wave 70.50 -- structured loss categorisation. Set when status flips to lost.';
COMMENT ON COLUMN public.leads.lost_at IS
  'Wave 70.50 -- timestamp when lead flipped to lost. Lets the funnel time-bucket churn without re-querying audit logs.';

-- ── 4. indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_quotes_lost_reason
  ON public.quotes(company_id, lost_reason) WHERE lost_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lost_reason
  ON public.leads(company_id, lost_reason) WHERE lost_reason IS NOT NULL;

-- ── 5. helpful view for the funnel work in 70.50b ──────────────────
-- "won_then_cancelled_quotes" -- quotes that were accepted then had
-- their child order cancelled. Sales scorecard needs to show these
-- as a distinct outcome from "won and delivered" + "never accepted".
CREATE OR REPLACE VIEW public.won_then_cancelled_quotes AS
SELECT
  q.id AS quote_id,
  q.company_id,
  q.quote_number,
  q.client_name,
  q.total_amount AS quoted_amount,
  q.converted_to_order_id AS order_id,
  o.cancelled_at,
  o.cancellation_reason_category,
  q.lost_reason,
  q.created_at AS quoted_at,
  o.cancelled_at AS lost_at
FROM public.quotes q
JOIN public.orders o ON o.id = q.converted_to_order_id
WHERE q.converted_to_order_id IS NOT NULL
  AND o.status = 'cancelled'
  AND q.deleted_at IS NULL
  AND o.deleted_at IS NULL;

COMMENT ON VIEW public.won_then_cancelled_quotes IS
  'Wave 70.50 -- quotes that converted to an order that was later cancelled. Drives the "churned" bucket in conversion-funnel widgets. Excludes soft-deleted rows.';
