-- Schema audit 2026-06-17 (part 3): missing foreign keys.
-- Several queries embed related rows via a FK column (PostgREST "table:fk_col(...)"),
-- but no FK constraint existed, so the embed 400'd (PGRST200) and broke the
-- whole query. Add the FKs (NOT VALID so existing rows aren't re-checked;
-- PostgREST still detects them for embedding). order refs CASCADE; the
-- (nullable) profile refs SET NULL on delete.

DO $$
BEGIN
  -- equipment_damages.order_id -> orders
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_damages_order_id_fkey') THEN
    ALTER TABLE public.equipment_damages
      ADD CONSTRAINT equipment_damages_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE NOT VALID;
  END IF;

  -- payment_reminders.order_id -> orders
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_reminders_order_id_fkey') THEN
    ALTER TABLE public.payment_reminders
      ADD CONSTRAINT payment_reminders_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE NOT VALID;
  END IF;

  -- kitchen_duty_shifts.staff_id -> profiles ; .order_id -> orders
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_duty_shifts_staff_id_fkey') THEN
    ALTER TABLE public.kitchen_duty_shifts
      ADD CONSTRAINT kitchen_duty_shifts_staff_id_fkey FOREIGN KEY (staff_id)
      REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_duty_shifts_order_id_fkey') THEN
    ALTER TABLE public.kitchen_duty_shifts
      ADD CONSTRAINT kitchen_duty_shifts_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE NOT VALID;
  END IF;

  -- kitchen_task_completions.staff_id -> profiles ; .order_id -> orders (NOT NULL)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_task_completions_staff_id_fkey') THEN
    ALTER TABLE public.kitchen_task_completions
      ADD CONSTRAINT kitchen_task_completions_staff_id_fkey FOREIGN KEY (staff_id)
      REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_task_completions_order_id_fkey') THEN
    ALTER TABLE public.kitchen_task_completions
      ADD CONSTRAINT kitchen_task_completions_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE NOT VALID;
  END IF;

  -- delivery_route_stops.driver_id -> profiles (constraint name matches the
  -- !delivery_route_stops_driver_id_fkey hint used in routeStopService).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_route_stops_driver_id_fkey') THEN
    ALTER TABLE public.delivery_route_stops
      ADD CONSTRAINT delivery_route_stops_driver_id_fkey FOREIGN KEY (driver_id)
      REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
  END IF;

  -- support_ticket_messages.user_id -> profiles
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_ticket_messages_user_id_fkey') THEN
    ALTER TABLE public.support_ticket_messages
      ADD CONSTRAINT support_ticket_messages_user_id_fkey FOREIGN KEY (user_id)
      REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
