import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";

const { data: a } = await sb.from('driver_assignments')
  .select('*').eq('order_id', OID).eq('assignment_type','collection').maybeSingle();
console.log('=== collection assignment ===');
console.log(JSON.stringify({status:a?.status, en_route_at:a?.en_route_at, completed_at:a?.completed_at, driver_id:a?.driver_id, scheduled_for:a?.scheduled_for}, null, 2));

const uid = "9c4f41f0-25d7-4f86-b9e2-6d804d97e07e";
const { data: coll } = await sb.from('notifications')
  .select('notification_type, title, related_entity_id, recipient_id, created_at')
  .ilike('notification_type','collection%')
  .order('created_at',{ascending:false}).limit(20);
console.log('\n=== ALL collection* notifications in system (any recipient) ===');
console.log(coll?.length ? coll.map(n=>`[${n.notification_type}] recip=${n.recipient_id?.slice(0,8)} entity=${n.related_entity_id?.slice(0,8)} @ ${n.created_at}`).join('\n') : 'NONE');

// what's the current server time vs en_route_at
console.log('\nnow (server insert probe):', new Date().toISOString());
