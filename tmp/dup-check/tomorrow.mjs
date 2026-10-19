import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CO = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const { data: logs } = await sb.from("quote_followup_log").select("quote_id").eq("company_id", CO);
const recorded = new Set((logs||[]).map(l => l.quote_id));
const { data: quotes } = await sb.from("quotes").select("id, quote_number, client_email, quote_name, sent_at").eq("company_id", CO).not("sent_at","is",null).not("status","in","(accepted,rejected,expired)").is("deleted_at", null);
let skip = 0, send = 0; const sendList = [];
for (const q of quotes||[]) {
  if (recorded.has(q.id) || !q.client_email) continue;
  const subject = `Just checking in on ${q.quote_name || "your event"}`;
  const { data } = await sb.from("email_automation_log").select("id").eq("user_id", CO).eq("status","sent").ilike("recipient_email", q.client_email.trim()).eq("subject", subject).gte("created_at", q.sent_at).limit(1);
  if (data?.length) skip++; else { send++; sendList.push(`${q.quote_number} ${q.client_email} sent ${q.sent_at.slice(0,10)}`); }
}
console.log(`open quotes without a recorded follow-up: ${skip + send}`);
console.log(`  already got "Just checking in" -> recorded, NOT sent again: ${skip}`);
console.log(`  never chased yet -> would get their first follow-up when due: ${send}`);
console.log(sendList.slice(0, 12).join("\n"));
