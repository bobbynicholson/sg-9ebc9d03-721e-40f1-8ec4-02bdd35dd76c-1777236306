import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

const { data: asgs, error } = await sb
  .from('driver_assignments')
  .select('id, order_id, status, en_route_at, completed_at, scheduled_for')
  .eq('assignment_type', 'collection')
  .order('scheduled_for', { ascending: false })
  .limit(6);
if (error) { console.error('asg err', error); process.exit(1); }
console.log('=== Recent collection assignments ===');
for (const a of asgs || []) {
  const { data: o } = await sb.from('orders')
    .select('order_number, client_id, client_email, client_name, company_id')
    .eq('id', a.order_id).maybeSingle();
  let clientUid = null, clientErr = null;
  if (o?.client_id) {
    const { data: cl, error: ce } = await sb.from('clients').select('user_id').eq('id', o.client_id).maybeSingle();
    clientUid = cl?.user_id || null; clientErr = ce?.message || null;
  }
  let notifs = [];
  if (clientUid) {
    const { data: n } = await sb.from('notifications')
      .select('notification_type, title, created_at, is_read')
      .eq('recipient_id', clientUid)
      .eq('related_entity_id', a.order_id)
      .order('created_at', { ascending: false }).limit(10);
    notifs = n || [];
  }
  console.log(`\nORDER ${o?.order_number} | asg status=${a.status} en_route=${!!a.en_route_at} completed=${!!a.completed_at}`);
  console.log(`  client_id=${o?.client_id} -> clients.user_id=${clientUid} ${clientErr?'(ERR '+clientErr+')':''}`);
  console.log(`  client_email=${o?.client_email}`);
  console.log(`  in-app notifications for this client on this order: ${notifs.length}`);
  for (const x of notifs) console.log(`    - [${x.notification_type}] "${x.title}" ${x.is_read?'read':'UNREAD'} @ ${x.created_at}`);
}
