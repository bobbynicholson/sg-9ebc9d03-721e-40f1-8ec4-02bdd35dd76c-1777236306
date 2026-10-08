import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
for (const t of ['quotes','orders','leads']) {
  const { data } = await sb.from(t).select('*').limit(1);
  console.log(t, Object.keys(data[0]||{}).filter(k=>/waiter|chef|staff|on_site|onsite|service/.test(k)).join(', '));
}
