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
      ('payment_gateway_credential_versions', 'Checkout credential history vault')
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
      ('accounting_integrations', 'Accounting integration table')
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

  -- Accounting OAuth tokens are stored in a company-scoped table. New values
  -- use the same versioned encryption, while older rows may still be raw
  -- base64 and will be rewritten on refresh. Count only; never return tokens.
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
      'Accounting tokens are company-scoped and must remain behind RLS.'
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

  IF to_regclass('public.integrations') IS NOT NULL
     AND to_regclass('public.whatsapp_credential_vault') IS NOT NULL THEN
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
    'Database-only result. It cannot prove Vercel key availability or successful application decryption.'
  );
END
$audit$;

SELECT check_name, status, actual, expected, notes
FROM pg_temp.credential_vault_audit_results
ORDER BY CASE status WHEN 'FAIL' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'WARN' THEN 3 WHEN 'INFO' THEN 4 ELSE 5 END,
         check_name;
