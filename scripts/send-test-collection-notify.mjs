import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const uid = "9c4f41f0-25d7-4f86-b9e2-6d804d97e07e";
const { data: o } = await sb.from('orders').select('company_id, venue_name, venue_address, event_name').eq('id',OID).maybeSingle();
const venue = o.venue_name || (o.venue_address ? String(o.venue_address).split(',')[0] : 'the venue');
const row = {
  company_id: o.company_id, recipient_id: uid, user_id: uid,
  notification_type: 'collection_en_route',
  title: "We're on the way to collect",
  message: `Our team is heading to ${venue} to collect the catering equipment. Please have it ready to hand over.`,
  priority: 'normal',
  link: `/client-portal/tracking?orderId=${OID}`,
  related_entity_type: 'order', related_entity_id: OID,
};
const { data, error } = await sb.from('notifications').insert([row]).select('id, created_at, is_read');
if (error) { console.log('INSERT FAILED:', error.message); process.exit(1); }
console.log('LIVE test notification placed for client. id=', data[0].id, 'is_read=', data[0].is_read);
console.log('Open the client portal bell (logged in as rajm267744@gmail.com) and you should see it.');
