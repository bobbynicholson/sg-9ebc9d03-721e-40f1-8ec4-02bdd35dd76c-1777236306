-- Track the start of each active email claim so a worker interruption cannot
-- strand a row in `in_progress` forever. The shared idempotency key is derived
-- from the durable queue-row ID, so a recovered send reuses that same key.
ALTER TABLE public.outgoing_email_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS oeq_in_progress_claimed_idx
  ON public.outgoing_email_queue (claimed_at)
  WHERE status = 'in_progress';

CREATE OR REPLACE FUNCTION public.claim_email_batch(
  p_allow_list uuid[],
  p_batch_size integer DEFAULT 25,
  p_max_attempts integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  to_email text,
  to_name text,
  subject text,
  body text,
  template_type text,
  variables jsonb,
  attempts integer,
  trigger_event text,
  trigger_ref_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT q.id
      FROM public.outgoing_email_queue q
     WHERE q.status = 'queued'
       AND q.company_id = ANY(p_allow_list)
       AND q.attempts < p_max_attempts
       AND (q.scheduled_for IS NULL OR q.scheduled_for <= now())
     ORDER BY q.scheduled_for NULLS FIRST, q.id
     LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outgoing_email_queue q
     SET status = 'in_progress',
         attempts = q.attempts + 1,
         claimed_at = now()
    FROM due
   WHERE q.id = due.id
  RETURNING
    q.id,
    q.company_id,
    q.to_email,
    q.to_name,
    q.subject,
    q.body,
    q.template_type,
    q.variables,
    q.attempts,
    q.trigger_event,
    q.trigger_ref_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_batch(uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(uuid[], integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
