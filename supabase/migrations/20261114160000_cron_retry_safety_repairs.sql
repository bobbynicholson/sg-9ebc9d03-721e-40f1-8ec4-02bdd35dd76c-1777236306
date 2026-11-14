-- Repair production schema drift used by scheduled recovery jobs.
-- This repeats the quote-expiry additions idempotently so environments where
-- the earlier migration was recorded but the columns are absent can recover.
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

-- The active tracking history table is gps_tracking(timestamp). The older
-- function still referred to a retired gps_tracking_logs table, so the weekly
-- cleanup failed before deleting anything. Keep the established 90-day window.
CREATE OR REPLACE FUNCTION public.archive_old_gps_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.gps_tracking
  WHERE "timestamp" < CURRENT_DATE - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
