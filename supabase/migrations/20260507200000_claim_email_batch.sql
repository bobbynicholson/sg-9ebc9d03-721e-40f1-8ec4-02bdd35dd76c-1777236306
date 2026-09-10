-- P1-09: pessimistic claim-locking for outgoing_email_queue
--
-- The cron worker (process-email-queue.ts) used an optimistic two-step
-- pattern: SELECT pending rows, then UPDATE ... WHERE status='pending'
-- in a loop. Functionally correct (the UPDATE atomically wins on
-- exactly one worker) but wasteful at scale: every concurrent worker
-- SELECTs the same batch and races on every row.
--
-- Replace with a SECURITY DEFINER function that does the SELECT and
-- UPDATE in a single transaction with FOR UPDATE SKIP LOCKED, so each
-- worker walks away with its own non-overlapping batch and the next
-- worker doesn't see the locked rows. Cleaner semantics, less wasted
-- traffic, and the function returns the claimed rows so callers don't
-- need a second roundtrip.

CREATE OR REPLACE FUNCTION public.claim_email_batch(
  p_allow_list uuid[],
  p_batch_size int DEFAULT 25,
  p_max_attempts int DEFAULT 3
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
  attempts int,
  trigger_event text,
  trigger_ref_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT q.id
      FROM public.outgoing_email_queue q
     WHERE q.status = 'pending'
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
         updated_at = now()
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

REVOKE ALL ON FUNCTION public.claim_email_batch(uuid[], int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_email_batch(uuid[], int, int) FROM anon;
REVOKE ALL ON FUNCTION public.claim_email_batch(uuid[], int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(uuid[], int, int) TO service_role;
