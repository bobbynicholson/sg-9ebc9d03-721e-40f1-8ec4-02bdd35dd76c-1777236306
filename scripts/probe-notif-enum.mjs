import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const uid = "9c4f41f0-25d7-4f86-b9e2-6d804d97e07e";
const company = "459b666a-... "; // will fetch
const { data: o } = await sb.from('orders').select('company_id').eq('id','5b0bc5a4-a33f-417f-bbfc-c046aa1de14a').maybeSingle();
const cid = o.company_id;
for (const t of ['collection_en_route','collection_complete']) {
  const { data, error } = await sb.from('notifications').insert([{
    company_id: cid, recipient_id: uid, user_id: uid,
    notification_type: t, title: 'PROBE '+t, message: 'probe', priority: 'normal',
    related_entity_type: 'order', related_entity_id: '5b0bc5a4-a33f-417f-bbfc-c046aa1de14a',
  }]).select('id');
  if (error) console.log(`INSERT ${t}: FAILED -> ${error.message} | code=${error.code}`);
  else { console.log(`INSERT ${t}: OK id=${data[0].id}`); await sb.from('notifications').delete().eq('id', data[0].id); console.log(`  (cleaned up probe row)`); }
}
