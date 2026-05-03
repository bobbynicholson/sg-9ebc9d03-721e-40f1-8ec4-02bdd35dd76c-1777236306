-- Bulk-import quarantine.
--
-- The platform already has import_jobs / import_rows / import_events
-- tracking what was uploaded. The gap (audit, May 2026) is that
-- imported rows are silently treated as fresh entries:
--   - leadService.createLead fires auto-reply emails on every insert
--   - kitchenPrepService.ensurePrepTasksForOrder fires on confirm
--   - sendStatusNotifications fires on confirm/ready/delivered
--   - the future after-sales worker would fire on completed events
-- So a tenant uploading 500 historical orders or 500 old leads gets
-- automation chaos (welcome emails to long-converted clients, kitchen
-- prep tasks for events two years in the past, etc.).
--
-- Fix: every people-bearing table gains a quarantine flag set at
-- import time. Outbound channels MUST check the flag before sending.

-- 1. Tracking columns. clients + orders already have import_job_id,
--    leads + quotes need it added. Every table also gets imported_at
--    and comms_paused_until.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS import_job_id      UUID REFERENCES public.import_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comms_paused_until TIMESTAMPTZ;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS imported_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comms_paused_until TIMESTAMPTZ;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS imported_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comms_paused_until TIMESTAMPTZ;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS import_job_id      UUID REFERENCES public.import_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comms_paused_until TIMESTAMPTZ;

-- 2. Track the moment the owner signs off and lets automations run
--    against the rows from a given batch. NULL = still quarantined,
--    timestamped = green-lit.
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS comms_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comms_enabled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes     TEXT;

-- 3. Indexes. comms_paused_until is rare (only set during a quarantine
--    window), so partial indexes keep the hot path cheap.
CREATE INDEX IF NOT EXISTS leads_comms_paused_idx
  ON public.leads (company_id, comms_paused_until)
  WHERE comms_paused_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_comms_paused_idx
  ON public.clients (company_id, comms_paused_until)
  WHERE comms_paused_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_comms_paused_idx
  ON public.orders (company_id, comms_paused_until)
  WHERE comms_paused_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotes_comms_paused_idx
  ON public.quotes (company_id, comms_paused_until)
  WHERE comms_paused_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_import_job_idx
  ON public.leads (import_job_id)
  WHERE import_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotes_import_job_idx
  ON public.quotes (import_job_id)
  WHERE import_job_id IS NOT NULL;

-- 4. Helper: is the email currently in a comms-paused state for the
--    given company? Single source of truth so multiple application
--    callers (send-email API, automation worker, status-change
--    notifier) can't drift apart.
--
--    Looks across leads + clients tables -- a person can exist in
--    either, and either side pausing means we shut up.
CREATE OR REPLACE FUNCTION public.is_comms_paused_for_email(
  p_company_id UUID,
  p_email      TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads
    WHERE company_id = p_company_id
      AND LOWER(email) = LOWER(p_email)
      AND comms_paused_until IS NOT NULL
      AND comms_paused_until > NOW()
      AND deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM public.clients
    WHERE company_id = p_company_id
      AND LOWER(email) = LOWER(p_email)
      AND comms_paused_until IS NOT NULL
      AND comms_paused_until > NOW()
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_comms_paused_for_email(UUID, TEXT)
  TO authenticated, service_role;

-- 5. Helper: green-light an entire import batch. Clears
--    comms_paused_until on every row that came from the batch and
--    stamps import_jobs.comms_enabled_at. Atomic so we don't end up
--    half-enabled if something fails midway.
CREATE OR REPLACE FUNCTION public.enable_comms_for_import_job(
  p_job_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_user_id    UUID := auth.uid();
  v_role       TEXT;
  v_leads      INTEGER := 0;
  v_clients    INTEGER := 0;
  v_orders     INTEGER := 0;
  v_quotes     INTEGER := 0;
BEGIN
  -- Authn / authz: caller must be in the same company as the job, or
  -- a super admin.
  SELECT company_id INTO v_company_id FROM public.import_jobs WHERE id = p_job_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Import job % not found', p_job_id;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role <> 'super_admin' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_user_id AND company_id = v_company_id
    ) THEN
      RAISE EXCEPTION 'Not authorised for company %', v_company_id;
    END IF;
  END IF;

  UPDATE public.leads
    SET comms_paused_until = NULL
    WHERE import_job_id = p_job_id;
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  UPDATE public.clients
    SET comms_paused_until = NULL
    WHERE import_job_id = p_job_id;
  GET DIAGNOSTICS v_clients = ROW_COUNT;

  UPDATE public.orders
    SET comms_paused_until = NULL
    WHERE import_job_id = p_job_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  UPDATE public.quotes
    SET comms_paused_until = NULL
    WHERE import_job_id = p_job_id;
  GET DIAGNOSTICS v_quotes = ROW_COUNT;

  UPDATE public.import_jobs
    SET comms_enabled_at = NOW(),
        comms_enabled_by = v_user_id
    WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'leads',   v_leads,
    'clients', v_clients,
    'orders',  v_orders,
    'quotes',  v_quotes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enable_comms_for_import_job(UUID)
  TO authenticated;
