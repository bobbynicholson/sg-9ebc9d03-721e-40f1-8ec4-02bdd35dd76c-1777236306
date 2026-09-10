-- Wave 23.5: per-tenant after-sales cadence control. The
-- defaultAfterSalesTemplates ship 6 emails (2, 4, 6, 8, 10, 12
-- months after event). For some tenants that's spam -- a wedding
-- caterer who only does the event once-per-couple might want only
-- the first follow-up; a corporate caterer who wants long-tail
-- nurture might want all six.
--
-- Two columns:
--   aftersales_max_months: skip any template whose monthsAfterEvent
--     exceeds this. Default 12 (current behaviour). Set to 0 to
--     skip after-sales entirely (companies.auto_followups_enabled
--     is the on/off; this gives tenants who want it ON but lighter).
--   aftersales_skip_template_ids: explicit per-template skip list
--     for tenants who want, say, the 2-month + 12-month ones but not
--     the middle ones. Empty array by default.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS aftersales_max_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS aftersales_skip_template_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.companies.aftersales_max_months IS
  'Skip after-sales templates whose monthsAfterEvent > this value. Default 12 = ship all six. Lower to 6 for the first three only, 0 to disable while keeping auto_followups_enabled on for other lifecycle emails.';
COMMENT ON COLUMN public.companies.aftersales_skip_template_ids IS
  'Explicit per-template skip list (e.g. {after-sales-3,after-sales-5}). Used for tenants who want a custom subset rather than a max-months ceiling.';
