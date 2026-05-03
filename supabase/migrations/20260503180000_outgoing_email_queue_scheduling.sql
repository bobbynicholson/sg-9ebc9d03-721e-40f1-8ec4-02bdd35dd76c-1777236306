-- After-sales email queue persistence (audit item #4).
--
-- outgoing_email_queue already existed but was effectively unused --
-- afterSalesAutomation.scheduleAfterSalesEmails built rows in memory
-- only, so a server restart wiped every pending follow-up. This
-- migration adds the columns the cron worker needs to dispatch
-- scheduled rows reliably:
--
--   scheduled_for : when this row should fire. NULL means ASAP.
--                   Lets the same table hold immediate "your quote
--                   is ready" sends and "rebook prompt 6 months
--                   after event" sends without separate plumbing.
--   attempts      : retry counter. The worker stops trying after
--                   a configurable cap so a permanent bounce
--                   doesn't loop forever.
--   template_type : optional logical key (e.g. 'aftersales_2mo')
--                   so we can group / count sends by category in
--                   the dashboard.
--   variables     : the {clientName, eventDate, ...} bag. Stored
--                   here because the worker re-builds the body via
--                   emailService at dispatch time, not now.

ALTER TABLE public.outgoing_email_queue
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS template_type TEXT,
  ADD COLUMN IF NOT EXISTS variables     JSONB;

CREATE INDEX IF NOT EXISTS oeq_pending_due_idx
  ON public.outgoing_email_queue (scheduled_for, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS oeq_company_status_idx
  ON public.outgoing_email_queue (company_id, status);
