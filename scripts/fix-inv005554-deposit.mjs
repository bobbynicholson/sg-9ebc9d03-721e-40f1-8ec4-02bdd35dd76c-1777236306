/** Repair INV-005554 / ORD-003849: a test-mode return backstop recorded the
 * FULL R14,002 instead of the 50% deposit. Delete the bad payment, reset the
 * invoice, then re-record the real deposit via record_invoice_payment so the
 * invoice -> partially_paid and the order -> payment_status='partial'. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const INV_ID="1fee78ff-4c4a-4f76-801f-3a9014aa3408";
const ORDER_ID="5b0bc5a4-a33f-417f-bbfc-c046aa1de14a";
const BAD_PAYMENT_ID="d65244dc-2832-4507-8179-647f32f44f03";

const { data: inv } = await sb.from("invoices").select("total_amount, company_id, client_id").eq("id",INV_ID).single();
const { data: co } = await sb.from("companies").select("deposit_percent").eq("id",inv.company_id).maybeSingle();
const pct = (co && Number(co.deposit_percent)>0 && Number(co.deposit_percent)<100) ? Number(co.deposit_percent) : 50;
const deposit = Math.round(inv.total_amount * (pct/100) * 100)/100;
console.log("total:", inv.total_amount, "deposit%:", pct, "deposit:", deposit);

// 1) delete the bad full-amount payment
const d = await sb.from("payments").delete().eq("id",BAD_PAYMENT_ID).select("id");
console.log("deleted bad payment rows:", (d.data||[]).length, d.error? d.error.message:"");

// 2) reset invoice to unpaid so the RPC recomputes from zero
const u = await sb.from("invoices").update({ amount_paid:0, balance_due:inv.total_amount, status:"sent", paid_at:null, updated_at:new Date().toISOString() }).eq("id",INV_ID).select("id");
console.log("invoice reset:", (u.data||[]).length, u.error? u.error.message:"");

// 3) record the real deposit via the RPC (idempotent transaction id)
const { data: rpc, error: rpcErr } = await sb.rpc("record_invoice_payment", {
  p_invoice_id: INV_ID, p_amount: deposit, p_payment_method: "payfast",
  p_transaction_id: `return-confirm-${INV_ID}-fix-deposit`,
  p_company_id: inv.company_id, p_client_id: inv.client_id, p_currency: "ZAR", p_gateway_provider: "payfast",
});
console.log("RPC:", rpcErr? ("ERR "+rpcErr.message): JSON.stringify(rpc));

// 4) stamp order deposit flag
const o = await sb.from("orders").update({ deposit_paid:true, deposit_paid_at:new Date().toISOString(), deposit_amount:deposit, balance_amount:inv.total_amount-deposit, updated_at:new Date().toISOString() }).eq("id",ORDER_ID).select("id");
console.log("order deposit stamped:", (o.data||[]).length, o.error? o.error.message:"");

// verify
const { data: invA } = await sb.from("invoices").select("invoice_number,status,total_amount,amount_paid,balance_due").eq("id",INV_ID).single();
const { data: ordA } = await sb.from("orders").select("order_number,payment_status,deposit_paid,deposit_amount,balance_amount").eq("id",ORDER_ID).single();
console.log("AFTER invoice:", JSON.stringify(invA));
console.log("AFTER order:", JSON.stringify(ordA));
