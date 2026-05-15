-- Wave 45 perf: embed_form_configs RLS init-plan rewrite + consolidate
-- Two FOR ALL policies (company_access_embed_configs, super_admin_all_embed_configs)
-- overlap completely. Consolidate into per-action policies that OR both checks.

DROP POLICY IF EXISTS company_access_embed_configs ON public.embed_form_configs;
DROP POLICY IF EXISTS super_admin_all_embed_configs ON public.embed_form_configs;

CREATE POLICY embed_form_configs_select
  ON public.embed_form_configs
  FOR SELECT
  USING (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (
        user_has_role((SELECT auth.uid()), 'company_admin'::user_role)
        OR user_has_role((SELECT auth.uid()), 'admin'::user_role)
      )
    )
    OR user_has_role((SELECT auth.uid()), 'super_admin'::user_role)
  );

CREATE POLICY embed_form_configs_insert
  ON public.embed_form_configs
  FOR INSERT
  WITH CHECK (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (
        user_has_role((SELECT auth.uid()), 'company_admin'::user_role)
        OR user_has_role((SELECT auth.uid()), 'admin'::user_role)
      )
    )
    OR user_has_role((SELECT auth.uid()), 'super_admin'::user_role)
  );

CREATE POLICY embed_form_configs_update
  ON public.embed_form_configs
  FOR UPDATE
  USING (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (
        user_has_role((SELECT auth.uid()), 'company_admin'::user_role)
        OR user_has_role((SELECT auth.uid()), 'admin'::user_role)
      )
    )
    OR user_has_role((SELECT auth.uid()), 'super_admin'::user_role)
  );

CREATE POLICY embed_form_configs_delete
  ON public.embed_form_configs
  FOR DELETE
  USING (
    (
      company_id = get_user_company_id((SELECT auth.uid()))
      AND (
        user_has_role((SELECT auth.uid()), 'company_admin'::user_role)
        OR user_has_role((SELECT auth.uid()), 'admin'::user_role)
      )
    )
    OR user_has_role((SELECT auth.uid()), 'super_admin'::user_role)
  );
