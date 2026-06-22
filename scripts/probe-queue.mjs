import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const COMPANY="0e139a19-6526-4e1f-9bf7-87d6adbee5f8";
const { data, error, count } = await sb.from("outgoing_email_queue").select("to_email, subject, status, attempts, error_message, created_at, company_id", {count:"exact"}).order("created_at",{ascending:false}).limit(15);
if (error) { console.log("outgoing_email_queue ERR:", error.message); process.exit(0); }
console.log("outgoing_email_queue total:", count);
for (const r of (data||[])) console.log(`  ${(r.status||"?").padEnd(10)} att=${r.attempts} co=${r.company_id?r.company_id.slice(0,8):"NULL"} to=${r.to_email} "${(r.subject||"").slice(0,30)}" err=${(r.error_message||"-").slice(0,45)}`);
// status breakdown
const { data: all } = await sb.from("outgoing_email_queue").select("status");
const c={}; for (const r of (all||[])) c[r.status||"null"]=(c[r.status||"null"]||0)+1;
console.log("\nstatus breakdown:", JSON.stringify(c));
