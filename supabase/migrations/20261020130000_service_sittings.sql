-- One commercial booking can have several timed service sittings.
-- Legacy bookings have no rows and continue to mean one sitting at orders.event_time.
CREATE TABLE IF NOT EXISTS public.service_sittings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  sequence_number SMALLINT NOT NULL CHECK (sequence_number BETWEEN 1 AND 12),
  guest_count INTEGER NOT NULL CHECK (guest_count > 0),
  service_time TIME NOT NULL,
  kitchen_ready_time TIME,
  dispatch_time TIME,
  packing_notes TEXT,
  cleaning_reset_required BOOLEAN NOT NULL DEFAULT false,
  return_required BOOLEAN NOT NULL DEFAULT false,
  return_time TIME,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ready','dispatched','served','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_sittings_parent_check CHECK (quote_id IS NOT NULL OR order_id IS NOT NULL),
  CONSTRAINT service_sittings_quote_sequence_unique UNIQUE NULLS NOT DISTINCT (quote_id, sequence_number),
  CONSTRAINT service_sittings_order_sequence_unique UNIQUE NULLS NOT DISTINCT (order_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS service_sittings_order_time_idx ON public.service_sittings(order_id, service_time);
CREATE INDEX IF NOT EXISTS service_sittings_quote_time_idx ON public.service_sittings(quote_id, service_time);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS equipment_return_plan TEXT NOT NULL DEFAULT 'final_collection'
    CHECK (equipment_return_plan IN ('final_collection','per_sitting_collection','on_site_return','client_return'));

ALTER TABLE public.driver_assignments
  ADD COLUMN IF NOT EXISTS service_sitting_id UUID REFERENCES public.service_sittings(id) ON DELETE SET NULL;
ALTER TABLE public.kitchen_prep_tasks
  ADD COLUMN IF NOT EXISTS service_sitting_id UUID REFERENCES public.service_sittings(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.driver_assignments_order_driver_type_unique;
CREATE UNIQUE INDEX IF NOT EXISTS driver_assignments_sitting_driver_type_unique
  ON public.driver_assignments (order_id, service_sitting_id, driver_id, assignment_type)
  NULLS NOT DISTINCT;

ALTER TABLE public.service_sittings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company members manage service sittings" ON public.service_sittings
  FOR ALL USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

DROP TRIGGER IF EXISTS update_service_sittings_updated_at ON public.service_sittings;
CREATE TRIGGER update_service_sittings_updated_at BEFORE UPDATE ON public.service_sittings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
