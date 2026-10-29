import { readFile, writeFile } from 'node:fs/promises';

const files = [
  '20261029120000_company_isolation_boundary.sql',
  '20261029130000_private_company_documents.sql',
  '20261029140000_company_rpc_and_view_boundaries.sql',
  '20261029150000_company_relationship_integrity.sql',
];
const preflight = `-- Complete company isolation rollout. Generated from the four source migrations.
-- Run the ENTIRE file in Supabase SQL Editor as the database administrator.
-- Deploy the updated app (including /api/company-files) with this database change.
-- This file does not revoke previously issued signed URLs or deploy the app.
-- Source migration versions remain available for the normal migration runner;
-- this manual bundle does not modify supabase_migrations migration history.
-- A later normal migration run can safely repeat these idempotent statements.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $company_security_preflight$
DECLARE missing text;
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'Company security rollout requires PostgreSQL 15 or newer';
  END IF;
  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Run this rollout as the database administrator in SQL Editor';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.role()') IS NULL THEN
    RAISE EXCEPTION 'This is not the expected Supabase database: auth helpers are missing';
  END IF;
  SELECT string_agg(name, ', ' ORDER BY name) INTO missing
  FROM unnest(ARRAY['public.profiles', 'public.companies', 'public.user_departments',
    'public.orders', 'public.company_number_settings', 'storage.buckets', 'storage.objects']) AS required(name)
  WHERE to_regclass(name) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Required tables are missing: %', missing; END IF;
  SELECT string_agg(id, ', ' ORDER BY id) INTO missing
  FROM unnest(ARRAY['imports', 'purchase-receipts', 'equipment-damage-photos', 'pod']) AS required(id)
  WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = required.id);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Required document buckets are missing: %', missing; END IF;
END;
$company_security_preflight$;
`;
const verification = (await readFile(new URL('../supabase/verification/company_isolation.sql', import.meta.url), 'utf8'))
  .replace(/\r\n/g, '\n').trim().replace(/;$/, '');
const assertions = `
-- Every one of the standalone verification checks must pass BEFORE COMMIT.
DO $company_security_verify$
DECLARE failed_checks text;
BEGIN
  SELECT string_agg(check_name, ', ' ORDER BY check_name) INTO failed_checks
  FROM (
${verification}
  ) AS verification WHERE passed IS NOT TRUE;
  IF failed_checks IS NOT NULL THEN
    RAISE EXCEPTION 'Company security verification failed: %', failed_checks;
  END IF;
END;
$company_security_verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- A successful result is produced only AFTER the whole transaction commits.
SELECT 'company_security_rollout_committed' AS result;
SELECT id AS bucket, public AS is_public FROM storage.buckets
WHERE id IN ('imports', 'purchase-receipts', 'equipment-damage-photos', 'pod') ORDER BY id;
`;

let sql = preflight;
for (const name of files) {
  const source = (await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  if ((source.match(/^BEGIN;\s*$/gm) || []).length !== 1 || (source.match(/^COMMIT;\s*$/gm) || []).length !== 1) {
    throw new Error(`Expected exactly one outer transaction in ${name}`);
  }
  const body = source.replace(/^BEGIN;[ \t]*\n/m, '').replace(/^COMMIT;[ \t]*(?:\n|$)/m, '').trim();
  sql += `\n-- Source: ${name}\n${body}\n`;
}
sql += assertions;
const target = new URL('../LOCAL_COMPANY_SECURITY_MIGRATIONS.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== sql) {
    throw new Error('Company SQL bundle differs from its source. Run node scripts/build-company-security-migration-bundle.mjs');
  }
  console.log(`Company security bundle matches all ${files.length} source migrations.`);
} else {
  await writeFile(target, sql);
  console.log(`Wrote LOCAL_COMPANY_SECURITY_MIGRATIONS.sql with ${files.length} migrations in one transaction.`);
}
