import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { count, error } = await sb.from("email_automation_log").select("*", { count: "exact", head: true });
console.log("TOTAL email_automation_log rows:", error?error.message:count);
const { data: recent } = await sb.from("email_automation_log").select("template_type, status, company_id, order_id, created_at, error_message").order("created_at",{ascending:false}).limit(10);
console.log("\nRecent 10 (all companies):");
for (const r of (recent||[])) console.log(`  ${(r.status||"?").padEnd(8)} ${r.template_type} co=${r.company_id?r.company_id.slice(0,8):"NULL"} ord=${r.order_id?r.order_id.slice(0,8):"NULL"} ${r.created_at?.slice(0,16)} err=${r.error_message?.slice(0,30)||"-"}`);
// re-check the order
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data: byOrder, count: oc } = await sb.from("email_automation_log").select("template_type,status", { count:"exact" }).eq("order_id",OID);
console.log("\nFor ORD-003849:", oc, "rows ->", (byOrder||[]).map(r=>r.template_type+":"+r.status).join(", ")||"(none)");
