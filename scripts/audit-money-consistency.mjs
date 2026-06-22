import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const r2 = n => Math.round(Number(n||0)*100)/100;
const eq = (a,b,tol=0.01) => Math.abs(r2(a)-r2(b)) <= tol;
const pass=[], fail=[];
const chk=(name,cond,detail)=>{ (cond?pass:fail).push(`${cond?"PASS":"FAIL"} ${name}${detail?" -> "+detail:""}`); };

const { data: o } = await sb.from("orders").select("subtotal, tax_amount, total_amount, balance_amount, amount_paid, deposit_amount, deposit_paid, balance_paid").eq("id",OID).maybeSingle();
const { data: inv } = await sb.from("invoices").select("id, subtotal, tax_amount, total_amount, balance_due, amount_paid, invoice_data, status").eq("order_id",OID).order("created_at",{ascending:true}).limit(1).maybeSingle();
const { data: pays } = await sb.from("payments").select("amount, payment_status").or(`order_id.eq.${OID},invoice_id.eq.${inv.id}`);
const paidSum = r2((pays||[]).filter(p=>p.payment_status==="completed").reduce((s,p)=>s+Number(p.amount||0),0));

console.log("ORDER:   subtotal",o.subtotal,"vat",o.tax_amount,"total",o.total_amount,"balance",o.balance_amount,"paid",o.amount_paid);
console.log("INVOICE: subtotal",inv.subtotal,"vat",inv.tax_amount,"total",inv.total_amount,"balance_due",inv.balance_due,"paid",inv.amount_paid,"status",inv.status);
const items = inv.invoice_data?.items||[];
const itemsSum = r2(items.reduce((s,it)=>s+Number(it?.total||0),0));
console.log("INVOICE_DATA: items",items.length,"sum",itemsSum,"subtotal",inv.invoice_data?.subtotal,"total",inv.invoice_data?.total);
console.log("PAYMENTS completed sum:",paidSum);
console.log("");

// Internal: order total = subtotal + vat
chk("order: total = subtotal + VAT", eq(o.total_amount, Number(o.subtotal)+Number(o.tax_amount)), `${o.total_amount} vs ${r2(Number(o.subtotal)+Number(o.tax_amount))}`);
// Internal: invoice total = subtotal + vat
chk("invoice: total = subtotal + VAT", eq(inv.total_amount, Number(inv.subtotal)+Number(inv.tax_amount)), `${inv.total_amount} vs ${r2(Number(inv.subtotal)+Number(inv.tax_amount))}`);
// Cross: order total == invoice total
chk("order.total == invoice.total", eq(o.total_amount, inv.total_amount), `${o.total_amount} vs ${inv.total_amount}`);
// Cross: order outstanding == invoice balance_due
chk("order.balance == invoice.balance_due", eq(o.balance_amount, inv.balance_due), `${o.balance_amount} vs ${inv.balance_due}`);
// invoice balance_due = total - paid
chk("invoice: balance_due = total - paid", eq(inv.balance_due, Number(inv.total_amount)-paidSum), `${inv.balance_due} vs ${r2(Number(inv.total_amount)-paidSum)}`);
// invoice_data items sum == invoice total (when items present)
if (items.length) chk("invoice_data items sum == invoice total", eq(itemsSum, inv.total_amount), `${itemsSum} vs ${inv.total_amount}`);
// payments completed == invoice amount_paid
chk("payments sum == invoice.amount_paid", eq(paidSum, inv.amount_paid), `${paidSum} vs ${inv.amount_paid}`);
// order amount_paid == payments
chk("payments sum == order.amount_paid", eq(paidSum, o.amount_paid), `${paidSum} vs ${o.amount_paid}`);

console.log("\n--- RESULTS ---");
for (const l of pass) console.log(l);
for (const l of fail) console.log(l);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
