-- Single source of truth: orders.event_date + orders.event_time.
-- Every downstream date / time that's derived from the event
-- (prep tasks, cleaning jobs, equipment hire, driver assignment,
-- outsource on-site requirement, cleaning handover, review due,
-- payment reminder, route stop ETA, outgoing emails) shifts by the
-- same delta when the order is rescheduled.
--
-- Bug report: changing the order's event_date on /admin/orders left
-- the cleaning checklist + downstream surfaces pinned to the old
-- date. The chain wasn't connected - every downstream had its own
-- copy and silently went stale.
--
-- Approach: a single AFTER UPDATE trigger that fires when either
-- event_date OR event_time changes. Computes the second-level
-- delta between old and new event timestamps, then propagates that
-- delta across every dependent table - but only on rows still
-- in-flight (uncompleted, not cancelled, not soft-deleted).
-- Already-delivered or already-sent rows are immutable history.
--
-- SECURITY DEFINER so the cascade bypasses RLS on downstream
-- tables (a sales admin updating orders may not have direct UPDATE
-- on kitchen_prep_tasks etc.). search_path locked to public.

CREATE OR REPLACE FUNCTION public.tg_orders_cascade_datetime_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_ts TIMESTAMPTZ;
  v_new_ts TIMESTAMPTZ;
  v_delta_seconds NUMERIC;
  v_date_delta_days INTEGER;
BEGIN
  IF OLD.event_date IS NOT DISTINCT FROM NEW.event_date
     AND OLD.event_time IS NOT DISTINCT FROM NEW.event_time THEN
    RETURN NEW;
  END IF;

  v_old_ts := (OLD.event_date::text || ' ' || COALESCE(OLD.event_time::text, '12:00:00'))::TIMESTAMPTZ;
  v_new_ts := (NEW.event_date::text || ' ' || COALESCE(NEW.event_time::text, '12:00:00'))::TIMESTAMPTZ;
  v_delta_seconds := EXTRACT(EPOCH FROM (v_new_ts - v_old_ts));
  v_date_delta_days := (NEW.event_date - OLD.event_date);

  IF v_delta_seconds = 0 AND v_date_delta_days = 0 THEN
    RETURN NEW;
  END IF;

  -- 1. kitchen_prep_tasks
  UPDATE public.kitchen_prep_tasks
     SET start_at = start_at + make_interval(secs => v_delta_seconds)
   WHERE order_id = NEW.id
     AND status IN ('pending', 'in_progress')
     AND deleted_at IS NULL
     AND start_at IS NOT NULL;

  -- 2. cleaning_jobs
  UPDATE public.cleaning_jobs
     SET planned_start = planned_start + make_interval(secs => v_delta_seconds),
         planned_end   = planned_end   + make_interval(secs => v_delta_seconds)
   WHERE triggered_by_event_id = NEW.id
     AND status IN ('queued', 'in_progress');

  -- 3. equipment_hire_orders (date-only)
  IF v_date_delta_days <> 0 THEN
    UPDATE public.equipment_hire_orders
       SET expected_pickup_date = expected_pickup_date + v_date_delta_days,
           expected_return_date = expected_return_date + v_date_delta_days
     WHERE order_id = NEW.id
       AND status NOT IN ('completed', 'cancelled', 'returned');
  END IF;

  -- 4. driver_assignments.scheduled_for (pre-en_route only)
  UPDATE public.driver_assignments
     SET scheduled_for = scheduled_for + make_interval(secs => v_delta_seconds)
   WHERE order_id = NEW.id
     AND scheduled_for IS NOT NULL
     AND status IN ('assigned', 'accepted');

  -- 5. outsource_assignments.required_on_site_at
  UPDATE public.outsource_assignments
     SET required_on_site_at = required_on_site_at + make_interval(secs => v_delta_seconds)
   WHERE order_id = NEW.id
     AND required_on_site_at IS NOT NULL
     AND status NOT IN ('completed', 'cancelled')
     AND deleted_at IS NULL;

  -- 6. cleaning_event_handovers.expected_at
  UPDATE public.cleaning_event_handovers
     SET expected_at = expected_at + make_interval(secs => v_delta_seconds)
   WHERE order_id = NEW.id
     AND expected_at IS NOT NULL
     AND status NOT IN ('completed', 'cancelled')
     AND deleted_at IS NULL;

  -- 7. pending_reviews.due_at
  UPDATE public.pending_reviews
     SET due_at = due_at + make_interval(secs => v_delta_seconds)
   WHERE order_id = NEW.id
     AND sent_at IS NULL
     AND cancelled_at IS NULL;

  -- 8. payment_reminders.reminder_date
  UPDATE public.payment_reminders
     SET reminder_date = reminder_date + make_interval(secs => v_delta_seconds)
   WHERE order_id = NEW.id
     AND sent_at IS NULL;

  -- 9. delivery_route_stops planning timestamps
  UPDATE public.delivery_route_stops
     SET estimated_arrival_time = CASE
           WHEN estimated_arrival_time IS NOT NULL
           THEN estimated_arrival_time + make_interval(secs => v_delta_seconds)
           ELSE NULL END,
         arrival_time = CASE
           WHEN arrival_time IS NOT NULL
           THEN arrival_time + make_interval(secs => v_delta_seconds)
           ELSE NULL END,
         departure_time = CASE
           WHEN departure_time IS NOT NULL
           THEN departure_time + make_interval(secs => v_delta_seconds)
           ELSE NULL END
   WHERE order_id = NEW.id
     AND actual_arrival_time IS NULL;

  -- 10. outgoing_email_queue (unsent, event-driven reminders)
  UPDATE public.outgoing_email_queue
     SET scheduled_for = scheduled_for + make_interval(secs => v_delta_seconds)
   WHERE trigger_ref_id = NEW.id
     AND scheduled_for IS NOT NULL
     AND sent_at IS NULL
     AND status IN ('pending', 'queued', 'paused');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_cascade_datetime ON public.orders;
CREATE TRIGGER trg_orders_cascade_datetime
  AFTER UPDATE OF event_date, event_time ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.event_date IS DISTINCT FROM NEW.event_date
    OR OLD.event_time IS DISTINCT FROM NEW.event_time
  )
  EXECUTE FUNCTION public.tg_orders_cascade_datetime_change();

COMMENT ON FUNCTION public.tg_orders_cascade_datetime_change() IS
  'Source-of-truth enforcement for orders.event_date + event_time. When an order is rescheduled, every downstream date / time still in-flight shifts by the same delta. Historical / completed rows are not touched.';
