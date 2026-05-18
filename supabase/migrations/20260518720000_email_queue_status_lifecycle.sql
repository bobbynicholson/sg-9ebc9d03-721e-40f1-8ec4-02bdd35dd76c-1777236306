-- Wave 70.49j - align outgoing_email_queue.status CHECK + claim RPC
-- with the actual lifecycle the application code uses.
--
-- The bug: the CHECK constraint was set to
--   ('queued', 'sent', 'failed', 'cancelled')
-- but every code path other than the initial INSERT used a different
-- vocabulary:
--
-- - claim_email_batch (cron drainer) SELECTs WHERE status='pending'
--   and UPDATEs to status='in_progress'. Neither 'pending' nor
--   'in_progress' were in the CHECK, so the cron NEVER claimed any
--   rows. As of 2026-05-18, 48 rows were sitting in 'queued' with
--   nothing draining them - the live tenant's order-confirmation and
--   quote-sent emails were silently being queued and never delivered.
-- - orderWorkflow.pauseOrder writes status='paused' and filters on
--   .eq("status","pending"). Both invalid, so pause was a no-op.
-- - orderWorkflow.resumeOrder writes status='pending' and filters on
--   .eq("status","paused"). Same.
--
-- Fix: extend the CHECK to the lifecycle the code actually intends -
--   queued -> in_progress -> sent | failed | cancelled
--                       \-> paused (side state) -> queued (resume)
-- and re-point the claim RPC at 'queued' instead of 'pending'.
--
-- The 48 currently-stuck rows are all on status='queued', the new
-- default, so no row migration is needed - they just become claimable
-- after this lands. None are >24h stale (verified 2026-05-18); the
-- cron's next tick will drain them as ordinary queued emails.

ALTER TABLE public.outgoing_email_queue
  DROP CONSTRAINT IF EXISTS outgoing_email_queue_status_check;

ALTER TABLE public.outgoing_email_queue
  ADD CONSTRAINT outgoing_email_queue_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text,
    'in_progress'::text,
    'paused'::text,
    'sent'::text,
    'failed'::text,
    'cancelled'::text
  ]));

-- Re-create the claim RPC with the corrected status filter. Body is
-- otherwise unchanged from the prior definition (claim_email_batch
-- migration 20260507200000): FOR UPDATE SKIP LOCKED, attempts gate,
-- scheduled_for window, batch size + allow-list params.

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
