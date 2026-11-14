-- Device subscriptions are private user data. The API validates the signed-in
-- account before storing them; the service role sends pushes from the queue.
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  active_role TEXT NOT NULL DEFAULT 'client',
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_idx
  ON public.web_push_subscriptions(user_id);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_manage_own_web_push_subscriptions ON public.web_push_subscriptions;
CREATE POLICY user_manage_own_web_push_subscriptions
  ON public.web_push_subscriptions
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Use an outbox so every notification insert is eligible for push delivery,
-- including rows created by database-backed workflows that do not call the
-- TypeScript notification service directly.
CREATE TABLE IF NOT EXISTS public.web_push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  manual_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (manual_retry_count >= 0),
  last_manual_retry_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, recipient_id)
);

ALTER TABLE public.web_push_notification_queue
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS manual_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (manual_retry_count >= 0),
  ADD COLUMN IF NOT EXISTS last_manual_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS web_push_notification_queue_due_idx
  ON public.web_push_notification_queue(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS web_push_notification_queue_company_status_idx
  ON public.web_push_notification_queue(company_id, status, created_at DESC);

ALTER TABLE public.web_push_notification_queue ENABLE ROW LEVEL SECURITY;
-- Intentionally no client policies: only service-role cron workers access jobs.

-- A small heartbeat lets an admin see if Vercel stopped invoking the worker,
-- while queue rows remain the source of truth for work and manual retries.
CREATE TABLE IF NOT EXISTS public.web_push_delivery_health (
  worker_key TEXT PRIMARY KEY CHECK (worker_key = 'push_delivery'),
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'never_run'
    CHECK (last_status IN ('never_run', 'running', 'ok', 'degraded', 'failed')),
  last_error TEXT,
  last_claimed INTEGER NOT NULL DEFAULT 0,
  last_sent INTEGER NOT NULL DEFAULT 0,
  last_retried INTEGER NOT NULL DEFAULT 0,
  last_failed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.web_push_delivery_health ENABLE ROW LEVEL SECURITY;
-- No client policies; the cron worker writes and the admin API reads via service role.

CREATE OR REPLACE FUNCTION public.enqueue_notification_for_web_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient UUID;
  v_company_id UUID;
BEGIN
  v_recipient := COALESCE(NEW.recipient_id, NEW.user_id);
  IF v_recipient IS NULL
    OR COALESCE(NEW.is_read, false)
    OR (
      NEW.channels IS NOT NULL
      AND NOT ('in_app' = ANY(NEW.channels) OR 'push' = ANY(NEW.channels))
    ) THEN
    RETURN NEW;
  END IF;

  v_company_id := COALESCE(
    NEW.company_id,
    (SELECT p.company_id FROM public.profiles p WHERE p.id = v_recipient)
  );

  INSERT INTO public.web_push_notification_queue (notification_id, recipient_id, company_id)
  VALUES (NEW.id, v_recipient, v_company_id)
  ON CONFLICT (notification_id, recipient_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_enqueue_web_push ON public.notifications;
CREATE TRIGGER notifications_enqueue_web_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_notification_for_web_push();

NOTIFY pgrst, 'reload schema';
