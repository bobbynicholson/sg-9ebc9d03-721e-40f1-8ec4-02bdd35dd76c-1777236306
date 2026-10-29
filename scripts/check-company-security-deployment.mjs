#!/usr/bin/env node
// Read-only deployment smoke check. Never changes accounts, rows or buckets.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the deployment to inspect.');
  process.exitCode = 1;
} else {
  const checks = [];
  const record = (name, pass) => checks.push({ name, pass });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.storage.listBuckets();
    if (result.error) throw new Error('Cannot inspect document buckets with the supplied credentials.');
    for (const id of ['imports', 'purchase-receipts', 'equipment-damage-photos', 'pod']) {
      const bucket = result.data.find(bucket => bucket.id === id);
      record(`${id} bucket exists and is private`, Boolean(bucket && bucket.public === false));
    }
    const imports = await client.storage.getBucket('imports');
    if (imports.error) throw new Error('Cannot inspect the imports MIME allowlist.');
    record('imports accepts receipt image and PDF formats', imports.data.allowed_mime_types == null
      || ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].every(type => imports.data.allowed_mime_types.includes(type)));
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Cannot inspect the database API schema.');
    const schema = await response.json();
    record('company boundary function is exposed in the deployed schema', Boolean(schema.paths?.['/rpc/company_boundary_allows']));
    record('local authentication bypass is disabled in this environment', process.env.NEXT_PUBLIC_ALLOW_LOCAL_AUTH_BYPASS !== 'true');
    for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
    const failures = checks.filter(check => !check.pass).length;
    console.log(`${checks.length - failures}/${checks.length} deployment smoke checks passed.`);
    console.log('This checks deployment prerequisites. Verify RLS policies, cross-company requests and legacy signed-link revocation separately.');
    if (failures) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Deployment inspection failed.');
    process.exitCode = 1;
  }
}
