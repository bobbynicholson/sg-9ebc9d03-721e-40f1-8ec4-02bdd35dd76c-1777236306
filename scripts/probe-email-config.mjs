import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const COMPANY="0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const { data: c, error } = await sb.from("companies").select("company_name, auto_followups_enabled, email, slug").eq("id",COMPANY).maybeSingle();
if (error) { console.log("ERR", error.message); }
console.log("COMPANY:", c.company_name, "auto_followups_enabled:", c.auto_followups_enabled, "email:", c.email);
// count pending emails for this company
const { data: pend } = await sb.from("email_automation_log").select("id, template_type, status").eq("company_id",COMPANY).eq("status","pending");
console.log("PENDING emails for company:", (pend||[]).length);
const byType = {};
for (const p of (pend||[])) byType[p.template_type] = (byType[p.template_type]||0)+1;
console.log(JSON.stringify(byType));
