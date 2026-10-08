import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: c } = await sb.from('companies').select('id, company_name, slug, embed_token, embed_pricing_tiers, currency').ilike('company_name','%spit%');
console.log(JSON.stringify(c,null,1));
for (const co of c||[]) {
  const { data: f } = await sb.from('embed_form_configs').select('id,name,slug,template_id,is_active,deleted_at,fields,theme').eq('company_id', co.id);
  console.log(JSON.stringify(f,null,1));
}
