import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data: e } = await sb.from("email_automation_log").select("template_type, status, company_id, recipient_email, sent_at, error_message, created_at").eq("order_id",OID).order("created_at",{ascending:false});
console.log("EMAILS for order:", (e||[]).length);
for (const r of (e||[])) console.log(`  ${r.template_type} | status=${r.status} | company_id=${r.company_id?r.company_id.slice(0,8):"NULL"} | to=${r.recipient_email||"NULL"} | sent_at=${r.sent_at||"-"} | err=${r.error_message||"-"}`);
