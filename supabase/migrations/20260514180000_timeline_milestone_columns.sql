-- Wave 25: two new milestone columns the OrderTimeline service
-- depends on. Without these the new 22-stage timeline at /admin/orders
-- can't surface "pre-event cleaning of owned equipment" or
-- "receipt issued" as their own dots -- it falls back to inferring
-- from email_automation_log (for receipt) or marks the stage
-- not_applicable (for pre-event cleaning).
--
-- equipment_bookings.pre_event_cleaning_done_at:
--   When the cleaning team confirms the owned-equipment items for
--   this order are clean + packed and ready for dispatch. Stamped
--   from the cleaning workflow on completion of the pre-event pass.
--   NULL = not done yet (the timeline shows the stage as upcoming
--   when the order has owned equipment).
--
-- payments.receipt_sent_at:
--   When the post-payment receipt email was actually delivered to
--   the client (distinct from payments.processed_at, which marks
--   when the money landed). Lets the timeline distinguish "balance
--   paid" from "receipt issued" -- two separate operator actions
--   that the client experiences as distinct touchpoints.

ALTER TABLE public.equipment_bookings
  ADD COLUMN IF NOT EXISTS pre_event_cleaning_done_at TIMESTAMPTZ;

COMMENT ON COLUMN public.equipment_bookings.pre_event_cleaning_done_at IS
  'When the cleaning team confirmed this owned-equipment booking is clean + packed and ready for dispatch. Powers the OrderTimeline pre_event_cleaning stage at /admin/orders. NULL = not done yet.';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payments.receipt_sent_at IS
  'When the post-payment receipt email was actually delivered to the client. Distinct from processed_at (money landed). Powers the OrderTimeline receipt_issued stage. NULL = no receipt sent yet (the timeline falls back to checking email_automation_log for receipt-template rows).';
