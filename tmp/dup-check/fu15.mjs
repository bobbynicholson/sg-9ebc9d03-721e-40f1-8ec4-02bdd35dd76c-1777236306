import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CO = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const { data: logs } = await sb.from("quote_followup_log").select("quote_id").eq("company_id", CO);
const recorded = new Set((logs||[]).map(l => l.quote_id));
const { data: quotes } = await sb.from("quotes").select("id, quote_number, client_email, quote_name, status, sent_at, valid_until, created_at").eq("company_id", CO).not("sent_at","is",null).not("status","in","(accepted,rejected,expired)").is("deleted_at", null);
const byEmail = {};
for (const q of quotes||[]) (byEmail[String(q.client_email).toLowerCase()] ||= []).push(q);
for (const e of ["natasha.cupido79@gmail.com","capesleslie90@gmail.com","collinsfiona84@gmail.com","vanderberghjanine@gmail.com"]) {
  console.log(e); for (const q of byEmail[e]||[]) console.log("   ", q.quote_number, q.status.padEnd(9), "sent", q.sent_at?.slice(0,10), "valid", q.valid_until, String(q.quote_name).padEnd(30), recorded.has(q.id) ? "RECORDED" : "not recorded");
}
const { data: sent15 } = await sb.from("email_automation_log").select("recipient_email").eq("user_id", CO).eq("template_type","email_lead_quoted").gte("created_at","2026-10-15T08:59:00Z").lte("created_at","2026-10-15T09:02:00Z");
const withRec = (sent15||[]).filter(s => (byEmail[s.recipient_email.toLowerCase()]||[]).some(q => recorded.has(q.id))).length;
console.log(`15 Oct follow-ups sent: ${sent15.length}; to clients with a recorded follow-up: ${withRec}; open sent quotes: ${quotes.length}; quotes recorded: ${recorded.size}`);
