// Measure the full extent of em-dash / double-dash in email templates.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data } = await sb.from("email_templates").select("id, company_id, template_type, subject, body");
const hasDash = (s) => s && (/\s--\s/.test(s) || s.includes("—") || /\s-\-/.test(s));
let g=0,t=0;
const globals=[];
for (const r of (data||[])) {
  const bad = hasDash(r.subject) || hasDash(r.body);
  if (!bad) continue;
  if (r.company_id === null) { g++; globals.push(r); } else t++;
}
console.log(`Total templates: ${(data||[]).length}`);
console.log(`GLOBAL rows with -- or em-dash: ${g}`);
for (const r of globals) console.log(`  [${(r.template_type||"").padEnd(28)}] subj="${(r.subject||"").slice(0,55)}"${hasDash(r.body)?" (body too)":""}`);
console.log(`TENANT-customized rows with -- or em-dash: ${t}`);
