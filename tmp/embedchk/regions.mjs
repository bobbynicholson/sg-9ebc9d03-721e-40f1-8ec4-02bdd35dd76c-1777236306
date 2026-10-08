import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('regions').select('id, name, address, lat, lng, is_active').eq('company_id','0e139a19-6526-4e1f-9bf7-87d6adbee5f8');
console.log(data);
const { data: c } = await sb.from('companies').select('headquarters_lat, headquarters_lng, address').eq('id','0e139a19-6526-4e1f-9bf7-87d6adbee5f8').single();
console.log(c);
