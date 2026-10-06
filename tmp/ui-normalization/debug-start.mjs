import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const t = Date.now();
const r = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'kitchen@spitbraaidelivery.co.za' });
console.log('generateLink', Date.now() - t, 'ms', r.error ? 'ERR ' + (r.error.message || r.error.status) : 'ok');
