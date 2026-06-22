import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data: inv } = await sb.from("invoices").select("id, invoice_number").eq("order_id",OID).limit(1).maybeSingle();
const { data: pays } = await sb.from("payments")
  .select("id, amount, payment_status, payment_method, payment_date, processed_at, invoice_id, order_id, transaction_id")
  .or(`invoice_id.eq.${inv.id},order_id.eq.${OID}`);
console.log("Invoice", inv.invoice_number, "id", inv.id);
console.log("PAYMENTS found:", (pays||[]).length);
for (const p of (pays||[])) console.log(`  ${p.payment_status} R${p.amount} method=${p.payment_method} inv=${p.invoice_id?"Y":"-"} ord=${p.order_id?"Y":"-"} date=${p.payment_date||p.processed_at||"-"}`);
const completed = (pays||[]).filter(p=>p.payment_status==="completed");
console.log("\ncompleted payments (receipt will show):", completed.length, completed.length? "-> RECEIPT OK":"-> receipt would say 'No completed payments'");
