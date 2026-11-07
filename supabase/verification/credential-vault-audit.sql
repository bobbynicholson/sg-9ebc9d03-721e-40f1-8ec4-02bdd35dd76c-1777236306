-- Read-only credential-vault audit for the Supabase SQL Editor.
-- Run the entire file as one script. It reads metadata and row counts only;
-- it does not display credential values or change public tables.
-- The temporary report table exists only in this SQL session.

CREATE TEMP TABLE IF NOT EXISTS credential_vault_audit_results (
  check_name text PRIMARY KEY,
  status text NOT NULL,
  actual bigint,
  expected text NOT NULL,
  notes text NOT NULL
) ON COMMIT PRESERVE ROWS;

TRUNCATE TABLE pg_temp.credential_vault_audit_results;

DO $audit$
DECLARE
  r record;
  v_table regclass;
  v_count bigint;
  v_rls boolean;
  v_service_role_access boolean;
  v_column_exists boolean;
  v_active_whatsapp bigint;
BEGIN
  -- Each credential table should have RLS enabled, no client policies, and
  -- no ACL entries for PUBLIC, anon, or authenticated. The payment gateway
  -- credentials table is RLS-deny-all in the existing migration; its ACL
  -- finding is marked REVIEW because that migration did not explicitly
  -- revoke grants.
  FOR r IN
    SELECT * FROM (VALUES
      ('whatsapp_credential_vault', 'WhatsApp credential vault'),
      ('platform_billing_credentials', 'Platform billing credential vault'),
      ('supplier_bank_details', 'Supplier bank detail vault'),
      ('payment_gateway_credentials', 'Payment gateway credential vault'),
      ('payment_gateway_credential_versions', 'Checkout credential history vault'),
      ('email_provider_credential_vault', 'Email provider credential vault')
    ) AS t(table_name, label)
  LOOP
    v_table := to_regclass(format('public.%I', r.table_name));
    IF v_table IS NULL THEN
      INSERT INTO pg_temp.credential_vault_audit_results
      VALUES (r.label || ': table exists', 'FAIL', 0, '1', 'Required table is missing.');
      CONTINUE;
    END IF;

    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (r.label || ': table exists', 'PASS', 1, '1', '');

    SELECT c.relrowsecurity INTO v_rls
    FROM pg_class AS c
    WHERE c.oid = v_table;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      r.label || ': RLS enabled',
      CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_rls THEN 1 ELSE 0 END,
      '1',
      'RLS must be enabled on every credential table.'
    );

    SELECT has_table_privilege('service_role', v_table, 'SELECT')
       AND has_table_privilege('service_role', v_table, 'INSERT')
       AND has_table_privilege('service_role', v_table, 'UPDATE')
       AND has_table_privilege('service_role', v_table, 'DELETE')
    INTO v_service_role_access;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      r.label || ': service_role read/write access',
      CASE WHEN v_service_role_access THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_service_role_access THEN 1 ELSE 0 END,
      '1',
      'The server-side service role needs SELECT/INSERT/UPDATE/DELETE.'
    );

    SELECT count(*) INTO v_count
    FROM (
      SELECT acl.grantee
      FROM pg_class AS c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) AS acl
      WHERE c.oid = v_table
      UNION ALL
      SELECT acl.grantee
      FROM pg_attribute AS a
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
      WHERE a.attrelid = v_table AND a.attnum > 0 AND NOT a.attisdropped
    ) AS grants
    WHERE grants.grantee = 0
       OR grants.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'));

    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      r.label || ': PUBLIC/anon/authenticated grants',
      CASE
        WHEN v_count = 0 THEN 'PASS'
        WHEN r.table_name = 'payment_gateway_credentials' THEN 'REVIEW'
        ELSE 'FAIL'
      END,
      v_count,
      '0',
      CASE
        WHEN v_count = 0 THEN 'No direct relation or column grants found.'
        WHEN r.table_name = 'payment_gateway_credentials' THEN 'A grant exists; RLS determines row access. Revoke client grants to enforce the service-only design.'
        ELSE 'Client/public grants exist on a service-only credential table.'
      END
    );

    SELECT count(*) INTO v_count
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = r.table_name
      AND p.permissive = 'PERMISSIVE'
      AND EXISTS (
        SELECT 1 FROM unnest(p.roles) AS policy_role(role_name)
        WHERE lower(policy_role.role_name) IN ('public', 'anon', 'authenticated')
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      r.label || ': permissive client RLS policies',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Restrictive company-boundary policies only filter access; they do not grant it. No permissive client policy should exist.'
    );
  END LOOP;

  FOR r IN
    SELECT * FROM (VALUES
      ('companies', 'Company source table'),
      ('suppliers', 'Supplier source table'),
      ('integrations', 'Integration source table'),
      ('email_provider_settings', 'Email provider source table'),
      ('accounting_integrations', 'Accounting integration table'),
      ('staff_invitations', 'Staff invitation table'),
      ('outsource_assignments', 'Outsource assignment table')
    ) AS t(table_name, label)
  LOOP
    v_table := to_regclass(format('public.%I', r.table_name));
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      r.label || ': table exists',
      CASE WHEN v_table IS NULL THEN 'FAIL' ELSE 'PASS' END,
      CASE WHEN v_table IS NULL THEN 0 ELSE 1 END,
      '1',
      ''
    );
  END LOOP;

  IF to_regclass('public.email_provider_credential_vault') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.email_provider_credential_vault
    WHERE jsonb_typeof(credentials) IS DISTINCT FROM 'object'
       OR NOT (credentials ? '__encrypted_v1');
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Email provider rows missing encrypted envelope',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Every stored email credential bundle must use the application encrypted envelope.'
    );

    SELECT count(*) INTO v_count
    FROM public.email_provider_credential_vault
    WHERE credentials->>'__encrypted_v1' !~ '^v[12]\.';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Email provider rows with unrecognized ciphertext format',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Only ciphertext version prefixes are inspected; values are not returned.'
    );
  END IF;

  IF to_regclass('public.email_provider_settings') IS NOT NULL THEN
    v_table := to_regclass('public.email_provider_settings');
    SELECT c.relrowsecurity INTO v_rls FROM pg_class AS c WHERE c.oid = v_table;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Email provider source table: RLS enabled',
      CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_rls THEN 1 ELSE 0 END,
      '1',
      'Email provider metadata remains company-scoped.'
    );

    SELECT count(*) INTO v_count
    FROM (VALUES ('anon'), ('authenticated')) AS client_roles(role_name)
    CROSS JOIN (VALUES ('smtp_pass_encrypted'), ('mailchimp_api_key_encrypted'), ('oauth_refresh_token_encrypted')) AS secret_columns(column_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS operations(privilege)
    WHERE has_column_privilege(
      client_roles.role_name,
      'public.email_provider_settings',
      secret_columns.column_name,
      operations.privilege
    );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Email provider legacy secrets: client column privileges',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Browser roles must use the authenticated server API; legacy credential columns are service-only.'
    );

    SELECT count(*) INTO v_count
    FROM public.email_provider_settings
    WHERE NULLIF(smtp_pass_encrypted, '') IS NOT NULL
       OR NULLIF(mailchimp_api_key_encrypted, '') IS NOT NULL
       OR NULLIF(oauth_refresh_token_encrypted, '') IS NOT NULL;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Legacy email provider credentials remaining',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0 after email credential backfill',
      'Legacy SMTP, Mailchimp, and email OAuth credential columns must be empty after vault migration.'
    );
  END IF;

  v_table := to_regclass('public.webhook_subscriptions');
  IF v_table IS NULL THEN
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES ('Webhook subscriptions: table exists', 'FAIL', 0, '1', 'Required webhook table is missing.');
  ELSE
    SELECT c.relrowsecurity INTO v_rls FROM pg_class AS c WHERE c.oid = v_table;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook subscriptions: RLS enabled',
      CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_rls THEN 1 ELSE 0 END,
      '1',
      'Company-scoped webhook metadata must remain behind RLS.'
    );

    SELECT count(*) INTO v_count
    FROM (VALUES ('anon'), ('authenticated')) AS client_roles(role_name)
    CROSS JOIN (VALUES ('signing_secret'), ('target_url')) AS protected_columns(column_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS operations(privilege)
    WHERE has_column_privilege(
      client_roles.role_name,
      'public.webhook_subscriptions',
      protected_columns.column_name,
      operations.privilege
    );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook credential columns: client privileges',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Client roles must not read, insert, or change the HMAC secret or bearer-like target URL.'
    );

    SELECT count(*) INTO v_count
    FROM (VALUES ('anon'), ('authenticated')) AS client_roles(role_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS operations(privilege)
    WHERE has_table_privilege(client_roles.role_name, 'public.webhook_subscriptions', operations.privilege);
    SELECT v_count + count(*) INTO v_count
    FROM pg_attribute AS a
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS client_roles(role_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS operations(privilege)
    WHERE a.attrelid = 'public.webhook_subscriptions'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(
        client_roles.role_name,
        'public.webhook_subscriptions',
        a.attname,
        operations.privilege
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook subscriptions: client table/column privileges',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Webhook configuration is managed through authenticated server APIs; browser roles need no direct grants.'
    );

    SELECT count(*) INTO v_count
    FROM pg_policies AS p
    WHERE p.schemaname = 'public' AND p.tablename = 'webhook_subscriptions';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook subscriptions: client RLS policies',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'The table is service-role-only; browser reads and writes use authenticated server APIs.'
    );

    SELECT count(*) INTO v_count
    FROM pg_attribute AS a
    CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
    WHERE a.attrelid = 'public.webhook_subscriptions'::regclass
      AND a.attname IN ('signing_secret', 'target_url')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
      AND (
        acl.grantee = 0 OR
        acl.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'))
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook credential columns: direct client column ACLs',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'This diagnostic counts direct column ACLs; the effective privilege check above also detects inherited grants.'
    );

    SELECT count(*) INTO v_count
    FROM pg_namespace AS schema_row
    WHERE schema_row.nspname IN ('public', 'extensions')
      AND (
        has_schema_privilege('anon', schema_row.oid, 'CREATE') OR
        has_schema_privilege('authenticated', schema_row.oid, 'CREATE')
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook SECURITY DEFINER schemas: client CREATE access',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Schemas on the dispatcher search_path must not be writable by client roles.'
    );

    SELECT count(*) INTO v_count
    FROM pg_proc AS helper
    WHERE helper.oid = to_regprocedure('public.dispatch_webhook(uuid, text, jsonb)')
      AND helper.prosecdef IS TRUE
      AND helper.prosrc ILIKE '%webhook_subscriptions%'
      AND helper.prosrc ILIKE '%signing_secret%'
      AND NOT has_function_privilege('anon', helper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', helper.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(helper.proacl, acldefault('f', helper.proowner))) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(helper.proconfig, ARRAY[]::text[])) AS cfg(setting)
        WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) =
          'search_path=pg_catalog,public,extensions,pg_temp'
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook dispatcher helper: safe definer/search_path/execute grants',
      CASE WHEN v_count = 1 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '1',
      'Requires the protected helper, explicit pg_temp-last path, and no PUBLIC/anon/authenticated EXECUTE grants.'
    );

    SELECT count(*) INTO v_count
    FROM (
      SELECT DISTINCT wrapper.oid, wrapper.prosecdef, wrapper.proconfig
      FROM pg_trigger AS trigger_row
      JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
      WHERE NOT trigger_row.tgisinternal
        AND wrapper.prosrc ILIKE '%dispatch_webhook%'
    ) AS webhook_wrappers
    WHERE webhook_wrappers.prosecdef IS DISTINCT FROM TRUE
       OR NOT EXISTS (
         SELECT 1
         FROM unnest(COALESCE(webhook_wrappers.proconfig, ARRAY[]::text[])) AS cfg(setting)
         WHERE lower(regexp_replace(cfg.setting, '\s+', '', 'g')) =
           'search_path=pg_catalog,public,pg_temp'
       );
    IF v_count = 0 AND NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_row
      JOIN pg_proc AS wrapper ON wrapper.oid = trigger_row.tgfoid
      WHERE NOT trigger_row.tgisinternal
        AND wrapper.prosrc ILIKE '%dispatch_webhook%'
    ) THEN
      v_count := 1;
    END IF;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook trigger wrappers: SECURITY DEFINER and safe search_path',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0 failing wrappers; at least one wrapper required',
      'Every trigger wrapper calling dispatch_webhook must be SECURITY DEFINER with pg_catalog first and pg_temp last.'
    );

    SELECT count(*) INTO v_count
    FROM public.webhook_subscriptions
    WHERE NULLIF(signing_secret, '') IS NOT NULL;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook signing secret: at-rest storage review',
      'REVIEW',
      v_count,
      'Encrypt after moving HMAC dispatch out of database triggers',
      'This column remains plaintext for database dispatch compatibility, although browser roles have no access.'
    );

    SELECT count(*) INTO v_count
    FROM public.webhook_subscriptions
    WHERE NULLIF(target_url, '') IS NOT NULL;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Webhook target URLs: at-rest storage review',
      'REVIEW',
      v_count,
      'Protect bearer-like URL components from database readers and backups',
      'Client roles are blocked, but webhook URLs may contain bearer-like path or query values and remain plaintext in the database.'
    );
  END IF;

  v_table := to_regclass('public.integrations');
  IF v_table IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM (VALUES ('anon'), ('authenticated')) AS client_roles(role_name)
    CROSS JOIN (VALUES ('access_token'), ('refresh_token'), ('credentials')) AS secret_columns(column_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS operations(privilege)
    WHERE has_column_privilege(
      client_roles.role_name,
      'public.integrations',
      secret_columns.column_name,
      operations.privilege
    );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Integration credential source: client column privileges',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Client roles must not access legacy integration access tokens, refresh tokens, or credential JSON.'
    );

    SELECT count(*) INTO v_count
    FROM public.integrations
    WHERE NULLIF(access_token, '') IS NOT NULL
       OR NULLIF(refresh_token, '') IS NOT NULL
       OR COALESCE(credentials, '{}'::jsonb) ?| ARRAY[
         'accessToken', 'refreshToken', 'clientSecret', 'client_secret', 'apiKey', 'api_key',
         'secret', 'secretKey', 'appSecret', 'accessTokenEncrypted', 'appSecretEncrypted'
       ]
       OR COALESCE(settings, '{}'::jsonb) ?| ARRAY[
         'webhookVerifyToken', 'webhookVerifyTokenEncrypted', 'webhookVerifyTokenHash'
       ];
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Legacy integration token copies remaining',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0 after provider-specific migration',
      'Counts only; raw integrations token columns and known secret JSON keys must be cleared.'
    );
  END IF;

  -- Exact plaintext/backfill conditions guarded by the billing cleanup
  -- migration. Optional legacy columns may already have been dropped.
  FOR r IN
    SELECT * FROM (VALUES
      ('companies', 'payfast_subscription_token', 'Company PayFast source tokens'),
      ('suppliers', 'account_number', 'Supplier source bank account numbers'),
      ('platform_billing_credentials', 'legacy_token', 'Legacy PayFast vault tokens'),
      ('supplier_bank_details', 'account_number', 'Plaintext supplier vault account numbers')
    ) AS t(table_name, column_name, label)
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = r.table_name
        AND column_name = r.column_name
    ) INTO v_column_exists;

    IF NOT v_column_exists THEN
      INSERT INTO pg_temp.credential_vault_audit_results
      VALUES (r.label, 'PASS', 0, '0', 'Legacy column is already absent.');
    ELSIF to_regclass(format('public.%I', r.table_name)) IS NULL THEN
      INSERT INTO pg_temp.credential_vault_audit_results
      VALUES (r.label, 'FAIL', NULL, '0', 'Table is missing.');
    ELSE
      EXECUTE format(
        'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND %I <> %L',
        r.table_name, r.column_name, r.column_name, ''
      ) INTO v_count;
      INSERT INTO pg_temp.credential_vault_audit_results
      VALUES (
        r.label,
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        v_count,
        '0',
        'Must be zero before the billing cleanup migration can finish.'
      );
    END IF;
  END LOOP;

  IF to_regclass('public.payment_gateway_credentials') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.payment_gateway_credentials
    WHERE credentials->>'__encrypted_v1' IS NULL;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Payment gateway rows missing encrypted envelope',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'This mirrors the billing cleanup migration guard; empty credential rows count too.'
    );

    SELECT count(*) INTO v_count
    FROM public.payment_gateway_credentials
    WHERE credentials->>'__encrypted_v1' IS NOT NULL
      AND credentials->>'__encrypted_v1' !~ '^v[12]\.';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Payment gateway rows with unrecognized ciphertext format',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Only ciphertext version prefixes are inspected; values are not returned.'
    );
  END IF;

  IF to_regclass('public.payment_gateway_credential_versions') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.payment_gateway_credential_versions
    WHERE credentials->>'__encrypted_v1' IS NULL;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Checkout history rows missing encrypted envelope',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'This mirrors the billing cleanup migration guard.'
    );

    SELECT count(*) INTO v_count
    FROM public.payment_gateway_credential_versions
    WHERE credentials->>'__encrypted_v1' IS NOT NULL
      AND credentials->>'__encrypted_v1' !~ '^v[12]\.';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Checkout history rows with unrecognized ciphertext format',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Only ciphertext version prefixes are inspected; values are not returned.'
    );
  END IF;

  IF to_regclass('public.platform_billing_credentials') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.platform_billing_credentials
    WHERE token_ciphertext IS NOT NULL AND token_ciphertext !~ '^v[12]\.';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'PayFast ciphertext rows with unrecognized format',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'The audit checks the version prefix, not whether the application key can decrypt it.'
    );
  END IF;

  IF to_regclass('public.supplier_bank_details') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.supplier_bank_details
    WHERE account_number_ciphertext IS NOT NULL
      AND account_number_ciphertext !~ '^v[12]\.';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Supplier ciphertext rows with unrecognized format',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'The audit checks the version prefix, not whether the application key can decrypt it.'
    );
  END IF;

  -- Accounting OAuth tokens are service-only. New values use the versioned
  -- encryption, while older rows may still be raw base64 and will be rewritten
  -- on refresh. Count only; never return tokens.
  IF to_regclass('public.accounting_integrations') IS NOT NULL THEN
    SELECT c.relrowsecurity INTO v_rls
    FROM pg_class AS c
    WHERE c.oid = 'public.accounting_integrations'::regclass;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Accounting integrations: RLS enabled',
      CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_rls THEN 1 ELSE 0 END,
      '1',
      'Token rows are server-only and must remain behind RLS.'
    );

    SELECT count(*) INTO v_count
    FROM pg_policies AS p
    WHERE p.schemaname = 'public' AND p.tablename = 'accounting_integrations';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Accounting integration token table: RLS policies',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Service-role API routes bypass RLS; no client policy is needed.'
    );

    SELECT count(*) INTO v_count
    FROM (
      SELECT acl.grantee
      FROM pg_class AS c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) AS acl
      WHERE c.oid = 'public.accounting_integrations'::regclass
      UNION ALL
      SELECT acl.grantee
      FROM pg_attribute AS a
      CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
      WHERE a.attrelid = 'public.accounting_integrations'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    ) AS grants
    WHERE grants.grantee = 0
       OR grants.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'));
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Accounting integration token table: PUBLIC/anon/authenticated grants',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'No client or public privileges should remain on encrypted OAuth tokens.'
    );

    SELECT has_table_privilege('service_role', 'public.accounting_integrations', 'SELECT')
       AND has_table_privilege('service_role', 'public.accounting_integrations', 'INSERT')
       AND has_table_privilege('service_role', 'public.accounting_integrations', 'UPDATE')
       AND has_table_privilege('service_role', 'public.accounting_integrations', 'DELETE')
    INTO v_service_role_access;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Accounting integration token table: service_role read/write access',
      CASE WHEN v_service_role_access THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_service_role_access THEN 1 ELSE 0 END,
      '1',
      'Only trusted server code needs CRUD access to accounting tokens.'
    );

    SELECT count(*) INTO v_count FROM public.accounting_integrations;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Accounting integration rows', 'INFO', v_count, 'Informational',
      'A zero count means OAuth token round-trip has not been exercised.'
    );

    SELECT count(*) INTO v_count
    FROM public.accounting_integrations
    WHERE access_token !~ '^(v1:|v2\.)'
       OR refresh_token !~ '^(v1:|v2\.)';
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Accounting rows with legacy/base64 tokens',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'WARN' END,
      v_count,
      '0 for fully encrypted rows',
      'Older base64 rows are readable by database readers; refresh/reconnect them before claiming full encryption.'
    );
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.profiles AS p
    JOIN public.companies AS c ON c.id = p.company_id
    WHERE c.slug = 'test-company'
      AND lower(p.email) IN (
        'admin@test-company.com',
        'driver@test-company.com',
        'kitchen@test-company.com',
        'shopping@test-company.com',
        'cleaning@test-company.com',
        'client@test-company.com'
      )
      AND p.is_active IS DISTINCT FROM false;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Public demo accounts still active',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Disable the known demo users because their reusable passwords were previously published on /demo.'
    );
  END IF;

  IF to_regclass('public.integrations') IS NOT NULL
     AND to_regclass('public.whatsapp_credential_vault') IS NOT NULL THEN
    IF to_regclass('public.companies') IS NOT NULL THEN
      SELECT count(*) INTO v_count
      FROM public.integrations AS i
      JOIN public.companies AS c ON c.id = i.company_id
      WHERE c.slug = 'test-company'
        AND i.integration_type = 'whatsapp'
        AND i.is_active = true;
      INSERT INTO pg_temp.credential_vault_audit_results
      VALUES (
        'Test Company active WhatsApp integrations',
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        v_count,
        '0',
        'Public demo accounts must not be able to send through a real WhatsApp integration.'
      );
    END IF;

    SELECT count(*) INTO v_count
    FROM public.integrations AS i
    WHERE i.integration_type = 'whatsapp'
      AND NULLIF(i.settings->>'webhookVerifyToken', '') IS NOT NULL;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Plaintext WhatsApp webhook tokens in integrations',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'This mirrors the billing cleanup migration guard.'
    );

    SELECT count(*) INTO v_count
    FROM public.integrations AS i
    WHERE i.integration_type = 'whatsapp'
      AND (
        NULLIF(i.credentials->>'accessTokenEncrypted', '') IS NOT NULL OR
        NULLIF(i.credentials->>'appSecretEncrypted', '') IS NOT NULL OR
        NULLIF(i.settings->>'webhookVerifyTokenEncrypted', '') IS NOT NULL OR
        NULLIF(i.settings->>'webhookVerifyTokenHash', '') IS NOT NULL
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'WhatsApp secret copies remaining in integrations',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'WARN' END,
      v_count,
      '0 after WhatsApp cleanup migration',
      'A nonzero count means the final source-column cleanup has not completed.'
    );

    SELECT count(*) INTO v_count
    FROM public.integrations AS i
    LEFT JOIN public.whatsapp_credential_vault AS v ON v.integration_id = i.id
    WHERE i.integration_type = 'whatsapp'
      AND (
        (NULLIF(i.credentials->>'accessTokenEncrypted', '') IS NOT NULL AND v.access_token_ciphertext IS NULL) OR
        (NULLIF(i.credentials->>'appSecretEncrypted', '') IS NOT NULL AND v.app_secret_ciphertext IS NULL) OR
        (NULLIF(i.settings->>'webhookVerifyTokenEncrypted', '') IS NOT NULL AND v.webhook_verify_token_ciphertext IS NULL) OR
        (NULLIF(i.settings->>'webhookVerifyTokenHash', '') IS NOT NULL AND v.webhook_verify_token_hash IS NULL) OR
        NULLIF(i.settings->>'webhookVerifyToken', '') IS NOT NULL
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'WhatsApp rows that would fail cleanup backfill guard',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Must be zero before removing the legacy WhatsApp secret copies.'
    );

    SELECT count(*) INTO v_active_whatsapp
    FROM public.integrations
    WHERE integration_type = 'whatsapp' AND is_active IS TRUE;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Active WhatsApp integrations',
      'INFO',
      v_active_whatsapp,
      'Informational',
      'If zero, credential round-trip behavior has not been exercised by a live integration.'
    );

    SELECT count(*) INTO v_count
    FROM public.integrations AS i
    LEFT JOIN public.whatsapp_credential_vault AS v ON v.integration_id = i.id
    WHERE i.integration_type = 'whatsapp' AND i.is_active IS TRUE
      AND (
        v.integration_id IS NULL OR
        NULLIF(v.access_token_ciphertext, '') IS NULL OR
        NULLIF(v.app_secret_ciphertext, '') IS NULL OR
        NULLIF(v.webhook_verify_token_ciphertext, '') IS NULL OR
        NULLIF(v.webhook_verify_token_hash, '') IS NULL
      );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Active WhatsApp integrations missing vault credentials',
      CASE WHEN v_active_whatsapp = 0 THEN 'INFO' WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0 when active WhatsApp integrations exist',
      'Requires access token, App secret, encrypted verify token, and verify-token hash.'
    );

    SELECT count(*) INTO v_count
    FROM public.whatsapp_credential_vault AS v
    WHERE (v.access_token_ciphertext IS NOT NULL AND v.access_token_ciphertext !~ '^v[12]\.')
       OR (v.app_secret_ciphertext IS NOT NULL AND v.app_secret_ciphertext !~ '^v[12]\.')
       OR (v.webhook_verify_token_ciphertext IS NOT NULL AND v.webhook_verify_token_ciphertext !~ '^v[12]\.');
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'WhatsApp vault rows with unrecognized ciphertext format',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Only ciphertext version prefixes are inspected; values are not returned.'
    );
  END IF;

  IF to_regclass('public.outsource_assignments') IS NOT NULL THEN
    v_table := to_regclass('public.outsource_assignments');
    SELECT c.relrowsecurity INTO v_rls FROM pg_class AS c WHERE c.oid = v_table;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Outsource assignments: RLS enabled',
      CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_rls THEN 1 ELSE 0 END,
      '1',
      'Outsource assignment rows must remain company-scoped.'
    );

    SELECT count(*) INTO v_count
    FROM (VALUES ('anon'), ('authenticated')) AS client_roles(role_name)
    WHERE has_column_privilege(
      client_roles.role_name,
      'public.outsource_assignments',
      'accept_token',
      'SELECT'
    );
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Outsource accept tokens: client read access',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
      v_count,
      '0',
      'Bearer links must not be readable from company-scoped browser queries; authorized server APIs release them only to admins.'
    );

    SELECT count(*) INTO v_count
    FROM public.outsource_assignments
    WHERE NULLIF(accept_token, '') IS NOT NULL;
    INSERT INTO pg_temp.credential_vault_audit_results
    VALUES (
      'Outsource accept tokens: plaintext at-rest review',
      CASE WHEN v_count = 0 THEN 'PASS' ELSE 'REVIEW' END,
      v_count,
      '0 or move to encrypted/hash-only storage',
      'Client roles are blocked, but a database-level read or backup can still reveal active bearer tokens.'
    );
  END IF;

  IF to_regclass('public.staff_invitations') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = 'public.staff_invitations'::regclass
        AND attname = 'invitation_token'
        AND attnum > 0
        AND NOT attisdropped
    ) INTO v_column_exists;

    IF v_column_exists THEN
      SELECT count(*) INTO v_count
      FROM public.staff_invitations
      WHERE invitation_token IS NOT NULL;

      INSERT INTO pg_temp.credential_vault_audit_results
      VALUES (
        'Unused staff invitation tokens remaining',
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        v_count,
        '0',
        'The application uses Supabase action links; the deprecated invitation_token field must remain empty.'
      );
    ELSE
      INSERT INTO pg_temp.credential_vault_audit_results
      VALUES (
        'Unused staff invitation tokens remaining', 'PASS', 0, '0',
        'The deprecated invitation_token column has been removed.'
      );
    END IF;
  END IF;

  SELECT count(*) FILTER (WHERE status = 'FAIL') INTO v_count
  FROM pg_temp.credential_vault_audit_results;
  INSERT INTO pg_temp.credential_vault_audit_results
  VALUES (
    'OVERALL',
    CASE
      WHEN v_count > 0 THEN 'FAIL'
      WHEN EXISTS (SELECT 1 FROM pg_temp.credential_vault_audit_results WHERE status = 'REVIEW') THEN 'REVIEW'
      WHEN EXISTS (SELECT 1 FROM pg_temp.credential_vault_audit_results WHERE status = 'WARN') THEN 'WARN'
      ELSE 'PASS'
    END,
    v_count,
    '0 FAIL checks',
    'Database-only result. It cannot prove application key availability or successful runtime decryption.'
  );
END
$audit$;

SELECT check_name, status, actual, expected, notes
FROM pg_temp.credential_vault_audit_results
ORDER BY CASE status WHEN 'FAIL' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'WARN' THEN 3 WHEN 'INFO' THEN 4 ELSE 5 END,
         check_name;
