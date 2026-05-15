-- Wave 45 perf: embed_form_submissions RLS init-plan rewrite + consolidate
-- Same shape as embed_form_configs.

DROP POLICY IF EXISTS company_access_embed_submissions ON public.embed_form_submissions;
DROP POLICY IF EXISTS super_admin_all_embed_submissions ON public.embed_form_submissions;

CREATE POLICY embed_form_submissions_select
  ON public.embed_form_submissions
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

CREATE POLICY embed_form_submissions_insert
  ON public.embed_form_submissions
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

CREATE POLICY embed_form_submissions_update
  ON public.embed_form_submissions
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

CREATE POLICY embed_form_submissions_delete
  ON public.embed_form_submissions
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
