import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CO = "0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const { data } = await sb.from("email_automation_log").select("created_at,status,template_type,recipient_email,subject").eq("user_id", CO).ilike("subject","%New enquiry from%").gte("created_at","2026-10-10T22:00:00Z").lte("created_at","2026-10-11T22:00:00Z").order("created_at");
for (const e of data||[]) console.log(e.created_at.slice(11,19), e.status.padEnd(6), String(e.template_type).padEnd(24), e.recipient_email.padEnd(32), e.subject);
