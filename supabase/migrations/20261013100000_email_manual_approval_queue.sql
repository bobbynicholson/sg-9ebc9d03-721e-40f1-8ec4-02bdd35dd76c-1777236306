-- Hold scheduled/background emails for an authorised admin without
-- overloading `paused`, which is already used for order-level holds.
-- `awaiting_approval` is deliberately not claimable by the scheduled
-- queue worker; it can only be released by the authenticated admin action.

ALTER TABLE public.outgoing_email_queue
  DROP CONSTRAINT IF EXISTS outgoing_email_queue_status_check;

ALTER TABLE public.outgoing_email_queue
  ADD CONSTRAINT outgoing_email_queue_status_check
  CHECK (status = ANY (ARRAY[
    'queued'::text,
    'awaiting_approval'::text,
    'in_progress'::text,
    'paused'::text,
    'sent'::text,
    'failed'::text,
    'cancelled'::text
  ]));

COMMENT ON COLUMN public.outgoing_email_queue.status IS
  'queued is worker-eligible; awaiting_approval is held for an authorised admin; paused is an order-level hold.';
