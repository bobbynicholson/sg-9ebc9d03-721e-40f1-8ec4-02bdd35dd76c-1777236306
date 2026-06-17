-- Schema audit 2026-06-17 (part 2): columns the app WRITES but the DB lacks.
-- Each missing column 400'd the whole insert/update, breaking the feature.
-- All additive + nullable + IF NOT EXISTS, so safe/idempotent.

-- Complaint resolution (complaintService.resolveComplaint writes all three).
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Staff invitation acceptance audit (userManagementService.acceptInvitation).
ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Staff pay run timestamp (paymentLedgerService + timeClockService mark paid).
ALTER TABLE public.staff_work_sessions
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Trial-expiry "seen" tracking (subscriptionService read + markTrialNotificationSeen).
ALTER TABLE public.trial_expiry_notifications
  ADD COLUMN IF NOT EXISTS dashboard_seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dashboard_seen_at timestamptz;

-- Integration disconnect timestamp (whatsapp + xero IntegrationService.disconnect).
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

-- Billing history tenant scope (stripe subscriptions webhook inserts company_id).
ALTER TABLE public.billing_history
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_billing_history_company ON public.billing_history(company_id);

-- Currency alert resolution timestamp (currencyMonitoringService.resolveAlert).
ALTER TABLE public.currency_fluctuation_alerts
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Time-clock punch fields. time_clock_entries was created with a session shape
-- (clock_in/clock_out) but the clock-in/out code writes punch records.
ALTER TABLE public.time_clock_entries
  ADD COLUMN IF NOT EXISTS entry_type text,
  ADD COLUMN IF NOT EXISTS "timestamp" timestamptz,
  ADD COLUMN IF NOT EXISTS location_lat numeric,
  ADD COLUMN IF NOT EXISTS location_lng numeric,
  ADD COLUMN IF NOT EXISTS notes text;
