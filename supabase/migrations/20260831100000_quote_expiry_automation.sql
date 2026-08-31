-- Quote-expiry automation state.
-- Delivery state lives on the quote so a provider outage can be retried on
-- the next cron run without changing the quote status again.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_admin_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_admin_emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_client_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expiry_client_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_client_emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_admin_notification_error text,
  ADD COLUMN IF NOT EXISTS expiry_admin_email_error text,
  ADD COLUMN IF NOT EXISTS expiry_client_notification_error text,
  ADD COLUMN IF NOT EXISTS expiry_client_email_error text;

CREATE INDEX IF NOT EXISTS idx_quotes_expiry_automation
  ON public.quotes (status, expired_at)
  WHERE deleted_at IS NULL AND status = 'expired';

COMMENT ON COLUMN public.quotes.expired_at IS
  'Timestamp at which the quote was automatically or defensively moved to expired.';
COMMENT ON COLUMN public.quotes.expiry_admin_notified_at IS
  'When the company-admin in-app expiry notification was delivered.';
COMMENT ON COLUMN public.quotes.expiry_admin_emailed_at IS
  'When the company expiry digest email was delivered.';
COMMENT ON COLUMN public.quotes.expiry_client_eligible IS
  'True when the quote was sent to a client before automatic expiry; drafts do not trigger client comms.';
COMMENT ON COLUMN public.quotes.expiry_client_notified_at IS
  'When the linked client portal user was notified in-app.';
COMMENT ON COLUMN public.quotes.expiry_client_emailed_at IS
  'When the quote-expired email was delivered to the client.';
