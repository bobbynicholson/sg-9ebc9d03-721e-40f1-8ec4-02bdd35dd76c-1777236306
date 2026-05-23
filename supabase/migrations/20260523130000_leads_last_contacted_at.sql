-- Leads: last_contacted_at column.
--
-- The /admin/leads suggestion engine computed "23d quiet, going
-- cold" using ageDays = today - created_at. So even after the
-- operator sent a follow-up email today, tomorrow the same lead
-- would still read "23d quiet" because the column was never
-- updated. The cold/quiet suggestion bucket lied permanently.
--
-- last_contacted_at is stamped by the page's follow-up send
-- handler (alongside the existing status flip to "contacted")
-- and the deriveLeadSuggestion helper now reads it in preference
-- to created_at when computing the "quiet for X days" reason.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

-- Partial index for the suggestion query (filtered to live leads).
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted_at
  ON public.leads(last_contacted_at)
  WHERE deleted_at IS NULL;
