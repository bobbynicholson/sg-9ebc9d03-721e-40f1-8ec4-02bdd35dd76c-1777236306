import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: c } = await sb.from('companies').select('id, company_name, slug, is_active, embed_token, owner_id, notification_email').order('created_at');
for (const co of c||[]) {
  const { count } = await sb.from('embed_form_configs').select('id', { count: 'exact', head: true }).eq('company_id', co.id).is('deleted_at', null);
  const { count: leads } = await sb.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', co.id);
  console.log([co.slug, co.company_name, co.is_active, 'forms='+count, 'leads='+leads, co.id].join(' | '));
}
