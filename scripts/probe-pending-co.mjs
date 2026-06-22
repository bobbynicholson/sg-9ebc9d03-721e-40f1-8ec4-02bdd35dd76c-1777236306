import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data } = await sb.from("email_automation_log").select("template_type,status,company_id,recipient_email,created_at").eq("order_id",OID).eq("status","pending");
console.log("PENDING rows for order:", (data||[]).length);
for (const r of (data||[])) console.log(`  ${r.template_type} company_id=${r.company_id===null?"NULL":r.company_id.slice(0,8)} to=${r.recipient_email||"NULL"} created_at=${r.created_at||"NULL"}`);
// global: how many pending have NULL company_id
const { count: nullCo } = await sb.from("email_automation_log").select("*",{count:"exact",head:true}).is("company_id",null).eq("status","pending");
const { count: totPend } = await sb.from("email_automation_log").select("*",{count:"exact",head:true}).eq("status","pending");
console.log(`\nGLOBAL pending: ${totPend}, of which NULL company_id: ${nullCo}`);
