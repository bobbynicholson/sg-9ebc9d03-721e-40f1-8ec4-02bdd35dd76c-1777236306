import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data: o } = await sb.from("orders").select("status, balance_amount, payment_status").eq("id",OID).maybeSingle();
console.log("Before: status", o.status, "balance", o.balance_amount, "payment_status", o.payment_status);
if (Number(o.balance_amount||0) > 0.009) { console.log("STILL OUTSTANDING - not completing."); process.exit(0); }
const now = new Date().toISOString();
const { error } = await sb.from("orders").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", OID);
if (error) { console.log("ERR", error.message); process.exit(1); }
const { data: a } = await sb.from("orders").select("status, completed_at").eq("id",OID).maybeSingle();
console.log("After:  status", a.status, "completed_at", a.completed_at, "-> CLOSED (green)");
