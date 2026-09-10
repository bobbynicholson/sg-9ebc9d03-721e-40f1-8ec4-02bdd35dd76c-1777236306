import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
// Revert order to the clean fully-paid base (no damage).
const { error: oErr } = await sb.from("orders").update({
  subtotal: 12175.65, tax_amount: 1826.35, total_amount: 14002,
  balance_amount: 0, balance_paid: true, payment_status: "paid", amount_paid: 14002,
  updated_at: new Date().toISOString(),
}).eq("id", OID);
if (oErr) { console.log("order ERR", oErr.message); process.exit(1); }
// Reopen the damage.
const { data: dmg } = await sb.from("equipment_damages").select("id").eq("order_id",OID).eq("damage_type","broken").order("created_at",{ascending:false}).limit(1).maybeSingle();
await sb.from("equipment_damages").update({ resolved:false, resolution_notes:null, resolved_at:null, resolved_by_user_id:null }).eq("id", dmg.id);
const { data: o } = await sb.from("orders").select("total_amount, balance_amount, balance_paid, payment_status, amount_paid").eq("id",OID).maybeSingle();
console.log("ORDER reverted:", JSON.stringify(o), "-> damage reopened");
