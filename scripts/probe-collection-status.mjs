import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data, error } = await sb.from("driver_assignments")
  .select("order_id, assignment_type, status, picked_up_at, completed_at, created_at")
  .eq("assignment_type","collection")
  .order("created_at",{ascending:false})
  .limit(10);
if (error) { console.log("ERR", error.message); process.exit(0); }
for (const r of data) console.log(`${r.order_id}  status=${r.status}  picked_up_at=${r.picked_up_at||"-"}  completed_at=${r.completed_at||"-"}`);
