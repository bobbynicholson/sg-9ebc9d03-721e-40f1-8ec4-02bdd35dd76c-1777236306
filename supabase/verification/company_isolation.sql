-- Read-only structural checks after LOCAL_COMPANY_SECURITY_MIGRATIONS.sql.
-- Expect every row's passed value to be true. This does not test HTTP access
-- or revoke old signed URLs; repeat the two-company application/storage checks.
WITH required_buckets(id) AS (
  VALUES ('imports'), ('purchase-receipts'), ('equipment-damage-photos'), ('pod')
), company_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
    AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'profiles'
), checks AS (
  SELECT 'private_bucket:' || required.id AS check_name,
    COALESCE(b.public IS FALSE AND b.id IS NOT NULL, false) AS passed
  FROM required_buckets required LEFT JOIN storage.buckets b ON b.id = required.id
  UNION ALL
  SELECT 'imports_receipt_mime_types', EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'imports' AND (allowed_mime_types IS NULL OR
      allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
  )
  UNION ALL
  SELECT 'storage_rls_enabled', EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'storage.objects'::regclass AND relrowsecurity
  )
  UNION ALL
  SELECT 'storage_restrictive_boundary', EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'company_documents_boundary' AND permissive = 'RESTRICTIVE' AND cmd = 'ALL'
  )
  UNION ALL
  SELECT 'company_tables_restrictive_boundaries', EXISTS (SELECT 1 FROM company_tables) AND NOT EXISTS (
    SELECT 1 FROM company_tables c WHERE NOT c.relrowsecurity OR EXISTS (
      SELECT 1 FROM (VALUES ('company_boundary_select','SELECT'), ('company_boundary_insert','INSERT'),
        ('company_boundary_update','UPDATE'), ('company_boundary_delete','DELETE')) AS required(name, cmd)
      WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
        AND p.tablename = c.relname AND p.policyname = required.name
        AND p.cmd = required.cmd AND p.permissive = 'RESTRICTIVE')
    )
  )
  UNION ALL
  SELECT 'profiles_and_companies_boundaries', NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['profiles','companies']) AS required(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_policies p JOIN pg_class c ON c.relname = p.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
      WHERE p.schemaname = 'public' AND p.tablename = required.name AND p.policyname = 'company_boundary'
        AND p.permissive = 'RESTRICTIVE' AND p.cmd = 'ALL' AND c.relrowsecurity)
  )
  UNION ALL
  SELECT 'profile_privilege_guard', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'trg_enforce_profile_immutable' AND tgenabled IN ('O','A')
  )
  UNION ALL
  SELECT 'department_privilege_guard', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_departments'::regclass
      AND tgname = 'guard_department_privileges' AND tgenabled IN ('O','A')
  )
  UNION ALL
  SELECT 'required_security_functions', NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['public.company_boundary_allows(uuid)',
      'public.company_storage_path_allowed(text,text)', 'public.assert_company_rpc_scope(uuid)',
      'public.enforce_company_relationship()']) AS required(signature)
    WHERE to_regprocedure(signature) IS NULL
  )
  UNION ALL
  SELECT 'views_use_caller_permissions', NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
          AND d.objsubid = 0 AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
      )
      AND NOT COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false)
  )
  UNION ALL
  SELECT 'privileged_functions_deny_user_execution', NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('mint_client_order_token', 'mint_client_account_token', 'dispatch_webhook')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  )
)
SELECT check_name, passed FROM checks ORDER BY check_name;
