-- FIX (2026-06-12): three DB-side failures surfaced by the quotes-list
-- convert-to-order cascade running in the browser (console dump from
-- live testing):
--
--   1. email_automation_log insert 403 ("Error logging email").
--      emailService.logEmailSent writes user_id = COMPANY id (the FK
--      to users was already dropped for this reason - see commit
--      79253bca), but the RLS policy only matched user_id IN (profile
--      ids of the caller's company). Company id is never a profile id,
--      so every browser-context audit insert bounced. Match the
--      company id directly, keeping the legacy profile-id match for
--      rows written before logEmailSent standardised on company id.
--
--   2. driver_assignments insert 403 ("[dispatchService]
--      driver_assignments insert failed"). The table only had
--      driver-scoped SELECT/UPDATE policies - no INSERT policy at all,
--      so the auto-assignment step of the cascade could never write
--      from an authenticated admin session. Add a company-members
--      manage policy mirroring the standard tenant pattern.
--
--   3. equipment_bookings availability query 400. The query embeds
--      orders via orders!equipment_bookings_order_id_fkey(...), but
--      Wave 30.2 only added the equipment_id FK - the order_id FK
--      never existed, so PostgREST can't resolve the relationship.
--      Clean up orphans, add the FK + index, reload the schema cache.

-- 1. email_automation_log: company-scoped access matching what the
--    code actually writes into user_id.
DROP POLICY IF EXISTS "company_access_email_log" ON email_automation_log;
CREATE POLICY "company_access_email_log" ON email_automation_log
  FOR ALL USING (
    user_id = get_user_company_id(auth.uid())
    OR user_id IN (SELECT id FROM profiles WHERE company_id = get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    user_id = get_user_company_id(auth.uid())
    OR user_id IN (SELECT id FROM profiles WHERE company_id = get_user_company_id(auth.uid()))
  );

-- 2. driver_assignments: company members manage their company's rows.
--    The existing driver_own_assignments (SELECT) and
--    driver_update_assignments (UPDATE by the driver) policies stay -
--    policies are OR'd, so drivers keep their narrower access.
DROP POLICY IF EXISTS "company_manage_assignments" ON public.driver_assignments;
CREATE POLICY "company_manage_assignments" ON public.driver_assignments
  FOR ALL USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- 3. equipment_bookings.order_id FK so the PostgREST embed resolves.
--    Remove orphaned bookings first or the constraint won't validate.
DELETE FROM public.equipment_bookings eb
WHERE eb.order_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = eb.order_id);

ALTER TABLE public.equipment_bookings
  DROP CONSTRAINT IF EXISTS equipment_bookings_order_id_fkey;
ALTER TABLE public.equipment_bookings
  ADD CONSTRAINT equipment_bookings_order_id_fkey
  FOREIGN KEY (order_id)
  REFERENCES public.orders(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_equipment_bookings_order_id
  ON public.equipment_bookings (order_id);

-- Refresh PostgREST's schema cache so the new FK embed + policies
-- take effect without a restart.
NOTIFY pgrst, 'reload schema';
