import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
for (const t of ['leads','quotes']) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  console.log(t, error ? error.message : Object.keys(data[0]||{}).filter(k=>/time|venue|distance|delivery|region/.test(k)).join(', '));
}
const { data: q } = await sb.from('quotes').select('id, quote_number, venue_address, venue_lat, venue_lng, region_id, delivery_distance_km, delivery_fee, delivery_rate_per_km, event_time, source, lead_id').eq('id','7be13180-d100-42c4-85b2-a1e2612a41aa').maybeSingle();
console.log('QUOTE', q);
if (q?.lead_id) { const { data: l } = await sb.from('leads').select('venue_lat, venue_lng, notes').eq('id', q.lead_id).maybeSingle(); console.log('LEAD', l); }
if (q?.region_id) { const { data: r } = await sb.from('regions').select('name, address, lat, lng, latitude, longitude').eq('id', q.region_id).maybeSingle(); console.log('REGION', r); }
