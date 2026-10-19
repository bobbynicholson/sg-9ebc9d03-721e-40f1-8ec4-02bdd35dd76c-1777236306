import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from("email_automation_log").select("status,template_type,error_message,recipient_email").gte("created_at","2026-10-15T08:59:00Z").lte("created_at","2026-10-15T09:02:00Z");
const c = {}; for (const r of data||[]) { const k = `${r.status} ${r.template_type} ${r.error_message||""}`.slice(0,160); c[k]=(c[k]||0)+1; } console.log(c);
const { data: api } = await sb.from("api_logs").select("*").ilike("path","%quote-followup%").gte("created_at","2026-10-15T08:59:00Z").limit(2);
console.log("api log:", JSON.stringify(api)?.slice(0, 800));
