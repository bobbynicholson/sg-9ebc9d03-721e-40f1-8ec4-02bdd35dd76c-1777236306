import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const company_id = '1417901f-2a08-4fd0-a264-29f47ce371cb';
const { data: leads } = await sb.from('leads').select('id, created_at, contact_name, email, phone, event_type, event_date, guest_count, venue_address, venue_lat, venue_lng, notes, requested_items, source, status').eq('company_id', company_id).order('created_at', { ascending: false }).limit(3);
console.log('LEADS', JSON.stringify(leads, null, 1));
const lead = leads?.[0];
if (lead) {
  const { data: sub } = await sb.from('embed_form_submissions').select('id, payload, created_at').eq('lead_id', lead.id);
  console.log('SUBMISSION', JSON.stringify(sub, null, 1));
  const { data: q } = await sb.from('quotes').select('id, quote_number, status, source, total_amount, menu_items, equipment_items').eq('lead_id', lead.id);
  console.log('DRAFT QUOTE', JSON.stringify(q, null, 1));
  const { data: n } = await sb.from('notifications').select('id, title, type, created_at').eq('company_id', company_id).order('created_at', { ascending: false }).limit(3);
  console.log('NOTIFICATIONS', JSON.stringify(n, null, 1));
}
const { data: form } = await sb.from('embed_form_configs').select('views_count, submissions_count, last_submission_at').eq('company_id', company_id).eq('slug', 'event-quote').single();
console.log('FORM COUNTERS', form);
