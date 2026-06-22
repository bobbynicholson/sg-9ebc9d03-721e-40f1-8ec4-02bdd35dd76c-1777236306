import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
// invoice + emails (timeline sources)
const { data: inv } = await sb.from("invoices").select("invoice_number, total_amount, created_at, sent_at, deleted_at").eq("order_id",OID);
console.log("INVOICES:", JSON.stringify(inv));
const { data: el } = await sb.from("email_automation_log").select("template_type,status").eq("order_id",OID).eq("status","sent");
console.log("SENT emails:", (el||[]).map(r=>r.template_type).join(", "));
// driver shift status
for (const t of ["driver_shifts","kitchen_shifts"]) {
  const { data, error } = await sb.from(t).select("id, status, actual_start, actual_end, staff_id, shift_type").eq("order_id",OID);
  if (!error) console.log(`${t}:`, (data||[]).map(s=>`${s.shift_type||"-"} status=${s.status} start=${s.actual_start?"Y":"-"} end=${s.actual_end?"Y":"NULL(open)"}`).join(" | ")||"(none)");
}
// driver_assignments
const { data: da } = await sb.from("driver_assignments").select("assignment_type,status,driver_id").eq("order_id",OID);
console.log("driver_assignments:", (da||[]).map(a=>`${a.assignment_type}=${a.status}`).join(", "));
