import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd(), true);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = 'rajm267748@gmail.com';
let existingUser;
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  existingUser = data.users.find(user => user.email?.toLowerCase() === email);
  if (existingUser || data.users.length < 1000) break;
}
if (existingUser) throw new Error('An auth account already exists for this email; preserve its login and inspect before provisioning.');
const { data: existingCompany, error: lookupError } = await db.from('companies').select('id').eq('slug', 'testraj').maybeSingle();
if (lookupError) throw lookupError;
if (existingCompany) throw new Error('testraj already exists; refusing to overwrite it');
const password = 'R!7a' + randomBytes(15).toString('base64url');
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true,
  user_metadata: { full_name: 'Raj Test', role: 'company_admin', active_role: 'company_admin', company_name: 'testraj' } });
if (error) throw error;
console.log(JSON.stringify({ ownerCreated: true, email, temporaryPassword: password }));
const response = await fetch('http://localhost:3001/api/auth/provision-company', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: data.user.id, email, companyName: 'testraj', slug: 'testraj', ownerName: 'Raj Test', currency: 'ZAR', timezone: 'Africa/Johannesburg' }),
});
const provisioned = await response.json();
if (!response.ok || !provisioned.company?.id) throw new Error(provisioned.error || 'Company provisioning failed');
const companyId = provisioned.company.id;
const expiredAt = new Date(Date.now() - 86400000).toISOString();
const { error: expiryError } = await db.from('companies').update({ subscription_status: 'suspended', subscription_plan: 'starter', trial_ends_at: expiredAt })
  .eq('id', companyId).eq('owner_id', data.user.id);
if (expiryError) throw expiryError;
const { data: company, error: verifyError } = await db.from('companies').select('id,slug,owner_id,subscription_status,subscription_plan,trial_ends_at,payfast_subscription_token')
  .eq('id', companyId).single();
if (verifyError) throw verifyError;
const { data: profile, error: profileError } = await db.from('profiles').select('company_id,role').eq('id', data.user.id).single();
if (profileError || profile.company_id !== companyId) throw new Error('Owner profile is not linked to testraj');
console.log(JSON.stringify({ company, profile, expired: new Date(company.trial_ends_at).getTime() < Date.now() }));
