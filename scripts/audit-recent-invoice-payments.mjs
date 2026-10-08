import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("payments")
  .select("id, amount, payment_status, payment_type, payment_method, payment_reference, gateway_transaction_id, created_at, processed_at, invoice_id, order_id, invoices:invoice_id(id, invoice_number, total_amount, amount_paid, balance_due, status), orders:order_id(id, order_number, total_amount, amount_paid, balance_amount, payment_status)")
  .order("created_at", { ascending: false })
  .limit(20);
if (error) throw error;
for (const payment of data || []) console.log(JSON.stringify(payment));

const invoiceId = "978611dd-c0d9-42f5-b050-2edf847af1aa";
const [{ data: invoice }, { data: invoicePayments }, { data: audits }, { data: amount3000 }, { data: emails }] = await Promise.all([
  supabase.from("invoices").select("id, invoice_number, total_amount, amount_paid, balance_due, status, order_id, client_id, updated_at").eq("id", invoiceId).maybeSingle(),
  supabase.from("payments").select("id, amount, payment_status, payment_method, payment_reference, gateway_transaction_id, created_at, processed_at, invoice_id, order_id").eq("invoice_id", invoiceId).order("created_at", { ascending: false }),
  supabase.from("audit_logs").select("action, details, created_at, user_id").eq("entity_id", invoiceId).order("created_at", { ascending: false }).limit(20),
  supabase.from("payments").select("id, amount, payment_status, invoice_id, order_id, created_at, payment_reference").eq("amount", 3000).order("created_at", { ascending: false }).limit(20),
  supabase.from("email_automation_log").select("template_type, subject, status, sent_at, created_at, invoice_id, order_id").eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(20),
]);
console.log("TARGET_INVOICE", JSON.stringify(invoice));
console.log("TARGET_PAYMENTS", JSON.stringify(invoicePayments));
console.log("TARGET_AUDITS", JSON.stringify(audits));
console.log("R3000_PAYMENTS", JSON.stringify(amount3000));
console.log("TARGET_EMAILS", JSON.stringify(emails));
