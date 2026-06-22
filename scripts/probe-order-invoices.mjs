import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID = "5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";

const { data: o } = await sb.from("orders").select("order_number, total_amount, deposit_amount, balance_amount, deposit_paid, balance_paid").eq("id", OID).maybeSingle();
console.log("ORDER", o.order_number, "total", o.total_amount, "deposit", o.deposit_amount, "balance", o.balance_amount, "deposit_paid", o.deposit_paid, "balance_paid", o.balance_paid);

const { data: invs } = await sb.from("invoices").select("invoice_number, status, subtotal, tax_amount, total_amount, amount_paid, balance_due, created_at, notes").eq("order_id", OID).order("created_at",{ascending:true});
console.log("\nINVOICES:", (invs||[]).length);
for (const i of (invs||[])) console.log(`  ${i.invoice_number} status=${i.status} total=${i.total_amount} paid=${i.amount_paid} balance_due=${i.balance_due} notes=${(i.notes||"").slice(0,60)}`);

const { data: dmgs } = await sb.from("equipment_damages").select("damage_type, total_cost, resolved, resolution_notes").eq("order_id", OID).order("created_at",{ascending:false});
console.log("\nDAMAGES:", (dmgs||[]).length);
for (const d of (dmgs||[])) console.log(`  ${d.damage_type} R${d.total_cost} resolved=${d.resolved} notes=${d.resolution_notes||"-"}`);
