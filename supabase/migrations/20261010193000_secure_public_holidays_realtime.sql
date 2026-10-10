-- Tenant custom holidays are operational/payroll data. Global gazetted rows
-- are shared, but a tenant must not be able to select another tenant's custom
-- shutdown or observance dates. This also scopes realtime delivery to the
-- current tenant plus global rows.

DROP POLICY IF EXISTS "public_holidays_read_all" ON public.public_holidays;
DROP POLICY IF EXISTS "public_holidays_company_write" ON public.public_holidays;

CREATE POLICY "public_holidays_read_global_or_own_company"
  ON public.public_holidays
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- Shared gazetted rows remain read-only. Tenant users can manage only rows
-- belonging to their own company; splitting the old FOR ALL policy prevents
-- its DELETE `USING` clause from accidentally permitting global-row deletion.
CREATE POLICY "public_holidays_company_insert"
  ON public.public_holidays
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "public_holidays_company_update"
  ON public.public_holidays
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "public_holidays_company_delete"
  ON public.public_holidays
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM public.profiles
      WHERE id = auth.uid()
    )
  );
