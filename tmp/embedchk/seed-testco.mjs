// Seeds Raj PayFast Test Company (the user's sandbox tenant) with a lead
// form + 2 menu items + 1 equipment item for a real end-to-end check.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const company_id = '1417901f-2a08-4fd0-a264-29f47ce371cb';
const { data: existing } = await sb.from('embed_form_configs').select('id').eq('company_id', company_id).eq('slug', 'event-quote').maybeSingle();
if (!existing) {
  const fields = [
    { id: 'name', type: 'text', label: 'Your name', order: 1, mapsTo: 'name', visible: true, required: true },
    { id: 'email', type: 'email', label: 'Email', order: 2, mapsTo: 'email', visible: true, required: true },
    { id: 'phone', type: 'phone', label: 'Phone / WhatsApp', order: 3, mapsTo: 'phone', visible: true, required: true },
    { id: 'event_type', type: 'select', label: 'Event type', order: 4, mapsTo: 'event_name', visible: true, required: true,
      options: [{ value: 'wedding', label: 'Wedding' }, { value: 'corporate', label: 'Corporate / work function' }] },
    { id: 'event_date', type: 'date', label: 'Event date', order: 5, mapsTo: 'event_date', visible: true, required: true },
    { id: 'eating_time', type: 'time', label: 'Eating time', order: 6, visible: true, required: false },
    { id: 'guest_count', type: 'number', label: 'Guests', order: 7, mapsTo: 'guest_count', visible: true, required: true, validation: { min: 1, max: 5000 } },
    { id: 'venue', type: 'text', label: 'Venue address', order: 8, mapsTo: 'venue', visible: true, required: false },
    { id: 'notes', type: 'textarea', label: 'Anything else?', order: 99, mapsTo: 'notes', visible: true, required: false },
  ];
  const { error } = await sb.from('embed_form_configs').insert({ company_id, template_id: 'detailed-multi-step', name: 'Event quote (E2E test)', slug: 'event-quote', fields, theme: {}, is_active: true, success_message: 'Thanks! Test received.' });
  console.log('form', error ? error.message : 'created');
} else console.log('form exists');
const { count: menuCount } = await sb.from('menu_items').select('id', { count: 'exact', head: true }).eq('company_id', company_id).is('deleted_at', null);
if (!menuCount) {
  const { error } = await sb.from('menu_items').insert([
    { company_id, item_name: 'E2E Lamb Spit', base_price: 120, category: 'Mains', is_available: true },
    { company_id, item_name: 'E2E Greek Salad', base_price: 25, category: 'Salads', is_available: true },
  ]);
  console.log('menu', error ? error.message : 'created');
}
const { count: eqCount } = await sb.from('equipment').select('id', { count: 'exact', head: true }).eq('company_id', company_id).is('deleted_at', null);
if (!eqCount) {
  const { error } = await sb.from('equipment').insert([{ company_id, name: 'E2E Chafing dish', rental_price: 85, category: 'Service', is_available: true }]);
  console.log('equipment', error ? error.message : 'created');
}
