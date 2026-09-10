import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const OID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const { data: inv } = await sb.from("invoices").select("id, company_id, client_id, balance_due, amount_paid, total_amount").eq("order_id",OID).limit(1).maybeSingle();
console.log("Invoice", inv.id, "balance_due", inv.balance_due, "amount_paid", inv.amount_paid);
const amount = Number(inv.balance_due||0);
if (amount <= 0) { console.log("Nothing outstanding, skipping."); process.exit(0); }

// 1. Record via the same RPC the gateway return uses.
const { data: rpc, error: rpcErr } = await sb.rpc("record_invoice_payment", {
  p_invoice_id: inv.id, p_amount: amount, p_payment_method: "card",
  p_transaction_id: "manual-balance-test-"+Date.now(),
  p_company_id: inv.company_id, p_client_id: inv.client_id,
  p_currency: "ZAR", p_gateway_provider: "test",
});
if (rpcErr) { console.log("RPC ERR", rpcErr.message); process.exit(1); }
console.log("Payment recorded:", JSON.stringify(rpc));

// 2. Reconcile order from fresh invoice (mirrors the confirm-return fix).
const { data: fresh } = await sb.from("invoices").select("amount_paid, balance_due").eq("id", inv.id).maybeSingle();
const paidToDate = Number(fresh.amount_paid||0);
const bal = Math.max(0, Number(fresh.balance_due??0));
const fullyPaid = bal <= 0.009;
const patch = { amount_paid: paidToDate, balance_amount: bal, balance_paid: fullyPaid, payment_status: fullyPaid?"paid":(paidToDate>0?"partial":"pending"), updated_at: new Date().toISOString() };
if (fullyPaid) patch.balance_paid_at = new Date().toISOString();
const { error: oErr } = await sb.from("orders").update(patch).eq("id", OID);
if (oErr) { console.log("order reconcile ERR", oErr.message); process.exit(1); }

const { data: o } = await sb.from("orders").select("payment_status, balance_paid, balance_amount, amount_paid").eq("id",OID).maybeSingle();
const { data: inv2 } = await sb.from("invoices").select("amount_paid, balance_due, status").eq("id",inv.id).maybeSingle();
console.log("\nORDER now: payment_status",o.payment_status,"balance_paid",o.balance_paid,"balance_amount",o.balance_amount,"amount_paid",o.amount_paid);
console.log("INVOICE now: amount_paid",inv2.amount_paid,"balance_due",inv2.balance_due,"status",inv2.status);
