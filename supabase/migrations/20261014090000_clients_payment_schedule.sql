-- Per-client override of the company payment schedule
-- (Settings -> Financial -> "Payment is due" + "Payment reminders").
-- NULL or a missing key = use the company setting. Shape:
--   { "due_direction": "before_event" | "after_event",
--     "due_days": 30,
--     "reminder_mode": "off" | "before_due",
--     "reminder_days": 2 }
-- Additive only: the app checks for this column and uses the company
-- setting for everyone until it exists.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS payment_schedule jsonb;

COMMENT ON COLUMN public.clients.payment_schedule IS
  'Per-client override of the company payment due date and payment reminder. NULL / missing key = company setting.';
