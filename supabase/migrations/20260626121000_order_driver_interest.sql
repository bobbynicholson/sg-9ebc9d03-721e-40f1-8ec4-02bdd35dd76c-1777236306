-- T.023: driver interest / self-nomination signal.
--
-- This is deliberately separate from claim_order(): a driver tapping
-- "Interested" does not assign the order. It gives dispatch a same-company,
-- auditable signal they can use from /admin/order-assignments.

CREATE TABLE IF NOT EXISTS public.order_driver_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'interested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_driver_interest_status_check
    CHECK (status IN ('interested', 'withdrawn')),
  CONSTRAINT order_driver_interest_unique_driver
    UNIQUE (order_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_order_driver_interest_company
  ON public.order_driver_interest(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_driver_interest_order
  ON public.order_driver_interest(order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_driver_interest_driver
  ON public.order_driver_interest(driver_id, status, created_at DESC);

DROP TRIGGER IF EXISTS update_order_driver_interest_updated_at
  ON public.order_driver_interest;
CREATE TRIGGER update_order_driver_interest_updated_at
  BEFORE UPDATE ON public.order_driver_interest
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.order_driver_interest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view their own order interest"
  ON public.order_driver_interest;
CREATE POLICY "Drivers can view their own order interest"
  ON public.order_driver_interest
  FOR SELECT
  USING (driver_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can view company order interest"
  ON public.order_driver_interest;
CREATE POLICY "Admins can view company order interest"
  ON public.order_driver_interest
  FOR SELECT
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (
          p.role::text IN ('owner', 'company_admin', 'admin', 'super_admin')
          OR p.active_role IN ('owner', 'company_admin', 'admin', 'super_admin')
        )
    )
  );

DROP POLICY IF EXISTS "Drivers can insert own order interest"
  ON public.order_driver_interest;
CREATE POLICY "Drivers can insert own order interest"
  ON public.order_driver_interest
  FOR INSERT
  WITH CHECK (
    driver_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.company_id = order_driver_interest.company_id
        AND (p.role::text = 'driver' OR p.active_role = 'driver')
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_driver_interest.order_id
        AND o.company_id = order_driver_interest.company_id
        AND o.assigned_driver_id IS NULL
        AND o.status IN ('confirmed', 'preparing', 'ready')
        AND o.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Drivers can update own order interest"
  ON public.order_driver_interest;
CREATE POLICY "Drivers can update own order interest"
  ON public.order_driver_interest
  FOR UPDATE
  USING (
    driver_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  )
  WITH CHECK (
    driver_id = (SELECT auth.uid())
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_driver_interest.order_id
        AND o.company_id = order_driver_interest.company_id
        AND o.assigned_driver_id IS NULL
        AND o.status IN ('confirmed', 'preparing', 'ready')
        AND o.deleted_at IS NULL
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_driver_interest'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_driver_interest;
  END IF;
END $$;

ALTER TABLE public.order_driver_interest REPLICA IDENTITY FULL;
