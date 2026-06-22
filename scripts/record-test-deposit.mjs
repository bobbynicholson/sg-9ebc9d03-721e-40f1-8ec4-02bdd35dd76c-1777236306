/** Record a 50% deposit on INV-005550 via record_invoice_payment so the
 * live pay page shows the real after-deposit state. Test tenant. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const PUBLIC_TOKEN = "aab457fb-de3c-4f4f-bb80-42b5935ef3f9";
const { data: inv } = await sb.from("invoices").select("id, invoice_number, client_id, company_id, total_amount, order_id").eq("public_token", PUBLIC_TOKEN).maybeSingle();
const deposit = Math.round((inv.total_amount||0)*0.5*100)/100;
const txn = "test-deposit-" + Date.now();
const { error } = await sb.rpc("record_invoice_payment", {
  p_invoice_id: inv.id, p_amount: deposit, p_payment_method: "eft", p_transaction_id: txn,
  p_company_id: inv.company_id, p_client_id: inv.client_id ?? null, p_currency: "ZAR", p_gateway_provider: "manual",
});
if (error) { console.error("RPC failed:", error); process.exit(1); }
const { data: after } = await sb.from("invoices").select("invoice_number, status, amount_paid, balance_due").eq("id", inv.id).maybeSingle();
console.log("Recorded deposit", deposit, "->", JSON.stringify(after));
