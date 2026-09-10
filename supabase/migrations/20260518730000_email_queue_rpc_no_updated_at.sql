-- Wave 70.49k - drop the updated_at write from claim_email_batch.
--
-- The previous version (20260518720000) and the original RPC
-- (20260507200000) both wrote `updated_at = now()` inside the
-- UPDATE step, but the outgoing_email_queue table has no
-- updated_at column. Postgres returns
--   ERROR: column "updated_at" of relation "outgoing_email_queue" does not exist
-- which is why the manual super_admin trigger of
-- /api/cron/process-email-queue returned 500 on 2026-05-18.
--
-- Why didn't the original RPC hit this error in production? Because
-- 20260507200000 also filtered on `status='pending'` (not in the
-- CHECK constraint), so the WITH CTE was always empty and the UPDATE
-- ran with zero rows - which short-circuited before evaluating the
-- updated_at clause. Now that 20260518720000 corrected the status
-- filter to 'queued', the broken UPDATE actually runs and the
-- missing-column error surfaces.
--
-- Fix: drop the updated_at assignment. The rest of the RPC is the
-- same as 20260518720000.

CREATE OR REPLACE FUNCTION public.claim_email_batch(
  p_allow_list  uuid[],
  p_batch_size  integer DEFAULT 25,
  p_max_attempts integer DEFAULT 5
)
RETURNS TABLE (
  id              uuid,
  company_id      uuid,
  to_email        text,
  to_name         text,
  subject         text,
  body            text,
  template_type   text,
  variables       jsonb,
  attempts        integer,
  trigger_event   text,
  trigger_ref_id  uuid
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
         attempts = q.attempts + 1
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
