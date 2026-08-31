-- Driver/client order chat hardening.
--
-- The original order_chat_messages policy treated every same-company staff
-- member as an audience member. That is appropriate for admin/dispatch
-- oversight, but a driver must only read or write the orders assigned to
-- them. Keep the existing private dispatch_messages channel unchanged.

CREATE OR REPLACE FUNCTION public.driver_can_access_order_chat(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND (
        o.assigned_driver_id = auth.uid()
        OR o.driver_id = auth.uid()
        OR o.secondary_driver_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.driver_assignments da
          WHERE da.order_id = o.id
            AND da.driver_id = auth.uid()
            AND da.status IN ('assigned', 'accepted', 'en_route', 'picked_up', 'at_venue')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.driver_can_access_order_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_can_access_order_chat(uuid) TO authenticated;

DROP POLICY IF EXISTS "order_chat_messages_read" ON public.order_chat_messages;
CREATE POLICY "order_chat_messages_read"
  ON public.order_chat_messages FOR SELECT TO authenticated
  USING (
    (
      company_id IN (
        SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND (
        COALESCE((
          SELECT p.active_role::text FROM public.profiles p WHERE p.id = auth.uid()
        ), (
          SELECT p.role::text FROM public.profiles p WHERE p.id = auth.uid()
        )) <> 'driver'
        OR public.driver_can_access_order_chat(order_id)
      )
    )
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.clients c ON c.id = o.client_id
      WHERE c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "order_chat_messages_insert" ON public.order_chat_messages;
CREATE POLICY "order_chat_messages_insert"
  ON public.order_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (
        sender_role = 'client'
        AND order_id IN (
          SELECT o.id FROM public.orders o
          JOIN public.clients c ON c.id = o.client_id
          WHERE c.user_id = auth.uid()
        )
      )
      OR (
        sender_role IN ('admin', 'kitchen', 'dispatcher', 'driver')
        AND company_id IN (
          SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
        )
        AND (
          sender_role <> 'driver'
          OR public.driver_can_access_order_chat(order_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS "order_chat_messages_mark_read" ON public.order_chat_messages;
CREATE POLICY "order_chat_messages_mark_read"
  ON public.order_chat_messages FOR UPDATE TO authenticated
  USING (
    (
      company_id IN (
        SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND (
        COALESCE((
          SELECT p.active_role::text FROM public.profiles p WHERE p.id = auth.uid()
        ), (
          SELECT p.role::text FROM public.profiles p WHERE p.id = auth.uid()
        )) <> 'driver'
        OR public.driver_can_access_order_chat(order_id)
      )
    )
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.clients c ON c.id = o.client_id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    read_at IS NOT NULL
  );

COMMENT ON FUNCTION public.driver_can_access_order_chat(uuid) IS
  'Restricts customer-facing order chat access to orders assigned to the authenticated driver.';
