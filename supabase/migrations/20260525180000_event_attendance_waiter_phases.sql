-- WTR-A: event_attendance tracks on-site presence + service phases
-- per waiter per order. Driver POD already captures arrival but is
-- focused on delivery confirmation; waiter shifts can span hours
-- after delivery (setup, service, clean-up). This is the canonical
-- on-the-ground record.
--
-- Service phases are timestamps (nullable) - the waiter taps each
-- one as it happens. event_complete_at is the terminal signal that
-- can flip the parent order to 'completed' once all field staff
-- have signed off.

CREATE TABLE IF NOT EXISTS public.event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  waiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Arrival on site (different from POD - POD is "I delivered the
  -- food", attendance is "I am here to staff this event").
  arrived_at timestamptz,
  -- Phase timestamps. Each is independent so a waiter can correct
  -- one without resetting the chain.
  setup_started_at timestamptz,
  guests_arrived_at timestamptz,
  service_started_at timestamptz,
  service_ended_at timestamptz,
  event_complete_at timestamptz,
  -- Equipment-back-to-kitchen helper. Waiter may take items back
  -- same-day or next-day - the timestamp lets cleaning know when
  -- to expect items.
  equipment_returned_at timestamptz,
  -- Live notes the waiter captures during the event (allergies
  -- surfaced, complaints, compliments). Admin reads on /admin/orders
  -- and /admin/reviews follow-up.
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One attendance row per (waiter, order). Re-tap = update.
  CONSTRAINT event_attendance_unique_waiter_order UNIQUE (order_id, waiter_id)
);

CREATE INDEX IF NOT EXISTS event_attendance_company_order_idx
  ON public.event_attendance (company_id, order_id);
CREATE INDEX IF NOT EXISTS event_attendance_waiter_idx
  ON public.event_attendance (waiter_id, arrived_at DESC);

-- RLS: tenant scoping. Waiter sees their own rows; admins see all
-- tenant rows.
ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_attendance_select ON public.event_attendance;
CREATE POLICY event_attendance_select ON public.event_attendance
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS event_attendance_insert ON public.event_attendance;
CREATE POLICY event_attendance_insert ON public.event_attendance
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND waiter_id = auth.uid()
  );

DROP POLICY IF EXISTS event_attendance_update ON public.event_attendance;
CREATE POLICY event_attendance_update ON public.event_attendance
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (
      waiter_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text IN ('super_admin','owner','company_admin','admin','region_admin')
      )
    )
  );

-- Auto-bump updated_at
CREATE OR REPLACE FUNCTION public.event_attendance_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END
$$;
DROP TRIGGER IF EXISTS tg_event_attendance_updated_at ON public.event_attendance;
CREATE TRIGGER tg_event_attendance_updated_at
BEFORE UPDATE ON public.event_attendance
FOR EACH ROW EXECUTE FUNCTION public.event_attendance_touch_updated_at();

COMMENT ON TABLE public.event_attendance IS
  'WTR-A: per-waiter per-order on-site attendance + service phase timestamps. One row per (order, waiter). Phase columns are independent timestamps that the waiter taps as the event progresses.';
