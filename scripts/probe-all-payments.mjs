import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data: o } = await sb.from("orders").select("payment_status, deposit_paid, balance_paid, amount_paid, balance_amount").eq("id",OID).maybeSingle();
console.log("ORDER payment_status:", o.payment_status, "deposit_paid:", o.deposit_paid, "balance_paid:", o.balance_paid, "amount_paid:", o.amount_paid, "balance_amount:", o.balance_amount);
const { data: inv } = await sb.from("invoices").select("id").eq("order_id",OID).limit(1).maybeSingle();
const { data: pays } = await sb.from("payments").select("id, amount, payment_status, payment_type, payment_method, payment_date, processed_at, created_at, invoice_id, order_id").or(`order_id.eq.${OID},invoice_id.eq.${inv.id}`).order("created_at",{ascending:false});
console.log("\nALL PAYMENTS for order/invoice:", (pays||[]).length);
for (const p of (pays||[])) console.log(`  ${p.payment_status} R${p.amount} type=${p.payment_type} method=${p.payment_method} created=${p.created_at} inv=${p.invoice_id?"Y":"-"} ord=${p.order_id?"Y":"-"}`);
// any very recent payments across the company (in case it's not linked)
const { data: recent } = await sb.from("payments").select("amount, payment_status, payment_method, created_at, order_id, invoice_id").order("created_at",{ascending:false}).limit(5);
console.log("\n5 MOST RECENT payments (any order):");
for (const p of (recent||[])) console.log(`  ${p.payment_status} R${p.amount} ${p.payment_method} ${p.created_at} ord=${p.order_id?.slice(0,8)||"-"} inv=${p.invoice_id?.slice(0,8)||"-"}`);
