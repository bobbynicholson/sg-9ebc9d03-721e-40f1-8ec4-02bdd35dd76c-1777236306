import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";

const { data: o } = await sb.from("orders").select("id, order_number, company_id, status, completed_at").eq("id", OID).single();
console.log("ORDER", o.order_number, "company", o.company_id, "status", o.status, "completed_at", o.completed_at || "-");

const { data: jobs, error: je } = await sb.from("cleaning_jobs")
  .select("id, status, created_at, actual_start, actual_end")
  .eq("triggered_by_event_id", OID);
console.log("\nCLEANING JOBS:", je ? je.message : jobs.length);
for (const j of (jobs||[])) console.log(`  ${j.id.slice(0,8)} status=${j.status} created=${j.created_at} end=${j.actual_end||"-"}`);

// cleaner accounts for this company - try users table with role filter
const { data: users, error: ue } = await sb.from("users")
  .select("id, email, full_name, role")
  .eq("company_id", o.company_id);
console.log("\nUSERS in company:", ue ? ue.message : users.length);
for (const u of (users||[])) console.log(`  ${u.role?.padEnd(16)||"?"} ${u.email||"-"}  (${u.full_name||"-"})`);
