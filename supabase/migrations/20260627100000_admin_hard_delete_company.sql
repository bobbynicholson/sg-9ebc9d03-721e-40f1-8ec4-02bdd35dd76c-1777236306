-- Hard-delete a tenant and its company-scoped data from the platform admin.
--
-- The public API route calls this with the service-role client after it has
-- verified the browser session belongs to a super_admin. Keep this function
-- service_role-only so authenticated users cannot call it directly.
CREATE OR REPLACE FUNCTION public.admin_hard_delete_company(
  p_company_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company public.companies%ROWTYPE;
  v_user_ids uuid[] := ARRAY[]::uuid[];
  v_table record;
  v_deleted integer := 0;
  v_remaining integer := 0;
  v_pass integer := 0;
  v_had_fk_error boolean := false;
BEGIN
  SELECT *
    INTO v_company
    FROM public.companies
    WHERE id = p_company_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % not found', p_company_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_user_ids
    FROM public.profiles
    WHERE company_id = p_company_id;

  -- Preserve the platform audit trail. audit_logs.company_id originally
  -- cascades with companies, so detach rows before the tenant is removed.
  INSERT INTO public.audit_logs (
    company_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    NULL,
    p_actor_user_id,
    'company_hard_deleted',
    'company',
    p_company_id,
    jsonb_build_object(
      'company_id', p_company_id,
      'company_name', v_company.company_name,
      'slug', v_company.slug,
      'owner_id', v_company.owner_id,
      'deleted_profile_ids', to_jsonb(v_user_ids)
    )
  );

  UPDATE public.audit_logs
     SET company_id = NULL
   WHERE company_id = p_company_id;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    UPDATE public.audit_logs
       SET user_id = NULL
     WHERE user_id = ANY(v_user_ids);
  END IF;

  -- Delete every public base table that carries company_id. This covers legacy
  -- tables that were created without ON DELETE CASCADE, and future tenant
  -- tables are picked up automatically. profiles is intentionally left for the
  -- companies(id) cascade because companies.owner_id may point at a profile in
  -- the same tenant.
  FOR v_pass IN 1..12 LOOP
    v_had_fk_error := false;

    FOR v_table IN
      SELECT n.nspname, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p')
         AND a.attname = 'company_id'
         AND NOT a.attisdropped
         AND c.relname NOT IN ('companies', 'profiles', 'audit_logs')
       ORDER BY c.relname
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I.%I WHERE company_id = $1', v_table.nspname, v_table.relname)
          USING p_company_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXCEPTION
        WHEN foreign_key_violation THEN
          v_had_fk_error := true;
        WHEN undefined_table OR undefined_column THEN
          NULL;
      END;
    END LOOP;

    EXIT WHEN NOT v_had_fk_error;
  END LOOP;

  -- Fail before deleting the company if any company-scoped table still has
  -- rows. That keeps the operation transactional instead of leaving a partially
  -- purged tenant.
  FOR v_table IN
    SELECT n.nspname, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND a.attname = 'company_id'
       AND NOT a.attisdropped
       AND c.relname NOT IN ('companies', 'profiles', 'audit_logs')
     ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE company_id = $1', v_table.nspname, v_table.relname)
        INTO v_remaining
        USING p_company_id;

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Could not delete % remaining row(s) from %.% for company %',
          v_remaining, v_table.nspname, v_table.relname, p_company_id
          USING ERRCODE = '23503';
      END IF;
    EXCEPTION
      WHEN undefined_table OR undefined_column THEN
        NULL;
    END;
  END LOOP;

  -- Some cleanup triggers can write audit rows while the tenant rows are
  -- being deleted. Detach again so those records are not removed by the
  -- final companies(id) cascade.
  UPDATE public.audit_logs
     SET company_id = NULL
   WHERE company_id = p_company_id;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    UPDATE public.audit_logs
       SET user_id = NULL
     WHERE user_id = ANY(v_user_ids);
  END IF;

  DELETE FROM public.companies
   WHERE id = p_company_id;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'company_name', v_company.company_name,
    'deleted_user_ids', to_jsonb(v_user_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hard_delete_company(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_hard_delete_company(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_hard_delete_company(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_company(uuid, uuid) TO service_role;
