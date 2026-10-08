import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const company_id = '1417901f-2a08-4fd0-a264-29f47ce371cb';
const { data } = await sb.from('menu_items').select('id').eq('company_id', company_id).eq('item_name', 'E2E Kiddies Meal').is('deleted_at', null);
if (!data?.length) { const { error } = await sb.from('menu_items').insert({ company_id, item_name: 'E2E Kiddies Meal', base_price: 75, category: 'Other', is_available: true }); console.log(error ? error.message : 'added kids meal'); } else console.log('exists');
