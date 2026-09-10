-- Next-day equipment collection.
--
-- Some jobs collect the equipment the MORNING AFTER the event, not the
-- same evening (late functions, venue won't release gear at midnight, the
-- crew is done for the day). The collection trip auto-scheduler
-- (orderWorkflow, on 'delivered') previously always booked the trip for the
-- same evening (event end + buffer, or 23:00), so a next-day pickup showed
-- as overdue overnight and the driver had no correct target time.
--
-- This adds an opt-in flag on quotes + orders. When set, the auto-schedule
-- (and the propagate-on-edit recompute) book the collection for the next
-- morning instead. Carried quote -> order by convert_quote_to_order's
-- payload (quoteService) and by propagateQuoteEditToOrder's FIELD_MAP.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS collection_next_day boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS collection_next_day boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.collection_next_day IS
  'When true, equipment is collected the morning after the event, not the same evening. Carried to the order on conversion.';
COMMENT ON COLUMN public.orders.collection_next_day IS
  'When true, the auto-scheduled collection trip is booked for the next morning instead of the same evening.';
