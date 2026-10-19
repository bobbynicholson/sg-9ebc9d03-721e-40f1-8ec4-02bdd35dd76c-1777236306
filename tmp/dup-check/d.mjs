import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CO = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
for (const [from, to] of [["2026-10-12T00:00:00Z","2026-10-12T00:05:00Z"],["2026-10-12T04:29:00Z","2026-10-12T04:34:00Z"]]) {
  const { data } = await sb.from("email_automation_log").select("created_at,status,template_type,recipient_email,subject").eq("user_id", CO).gte("created_at", from).lte("created_at", to).order("created_at");
  console.log(`\n${from} .. ${to}`); for (const e of data||[]) console.log("  ", e.created_at.slice(11,19), e.status.padEnd(7), String(e.template_type).padEnd(28), e.recipient_email.padEnd(45), e.subject);
}
const { data: p } = await sb.from("email_provider_settings").select("provider, bcc_email, cc_email, copy_to, automation_preferences").eq("company_id", CO).neq("provider","mailchimp");
console.log("\nsettings:", JSON.stringify(p));
