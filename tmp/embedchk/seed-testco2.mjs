// Sandbox tenant (Raj PayFast Test Company): add place-setting pieces +
// a starter so the course picker and equipment package can be tested.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const company_id = '1417901f-2a08-4fd0-a264-29f47ce371cb';
const { data: eq } = await sb.from('equipment').select('name').eq('company_id', company_id).is('deleted_at', null);
const have = new Set((eq || []).map((e) => e.name));
const add = [['E2E Plate 25cm', 2.5, 'Crockery'], ['E2E Knife', 2, 'Cutlery'], ['E2E Fork', 2, 'Cutlery']].filter(([n]) => !have.has(n));
if (add.length) { const { error } = await sb.from('equipment').insert(add.map(([name, rental_price, category]) => ({ company_id, name, rental_price, category, is_available: true }))); console.log('equipment', error ? error.message : 'added ' + add.length); }
const { data: m } = await sb.from('menu_items').select('item_name').eq('company_id', company_id).eq('item_name', 'E2E Beef Strips').is('deleted_at', null);
if (!m?.length) { const { error } = await sb.from('menu_items').insert({ company_id, item_name: 'E2E Beef Strips', base_price: 50, category: 'Starters', is_available: true }); console.log('menu', error ? error.message : 'added starter'); }
