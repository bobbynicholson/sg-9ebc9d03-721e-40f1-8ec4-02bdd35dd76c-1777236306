import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data: inv } = await sb.from("invoices").select("id, subtotal, tax_amount, total_amount, balance_due, amount_paid, invoice_data").eq("order_id","5b0bc5a4-a33f-417f-bbfc-c046aa1de14a").limit(1).maybeSingle();
const d = inv.invoice_data||{};
console.log("INVOICE columns: subtotal",inv.subtotal,"tax",inv.tax_amount,"total",inv.total_amount);
console.log("invoice_data: subtotal",d.subtotal,"taxRate",d.taxRate,"taxAmount",d.taxAmount,"total",d.total,"depositPaid",d.depositPaid,"balanceDue",d.balanceDue);
console.log("ITEMS:");
let sum=0;
for (const it of (d.items||[])) { sum += Number(it.total||0); console.log(`  ${it.description} | qty ${it.quantity} | unit ${it.unitPrice} | total ${it.total}`); }
console.log("items sum:", sum);
console.log("keys in invoice_data:", Object.keys(d).join(", "));
