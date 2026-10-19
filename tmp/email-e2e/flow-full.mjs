// PDF flow test: accept -> deposit (initial payment only) -> balance. Test company only.
import fs from "fs";
import { sb, asAdmin, newQuote, close, wait, COMPANY, BASE } from "./lib.mjs";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const report = async (label, from) => {
  const { data: logs } = await sb.from("email_automation_log").select("created_at,status,template_type,recipient_email,subject,error_message").eq("user_id", COMPANY).gte("created_at", from).order("created_at");
  log(`--- emails (${label}) ---`); for (const e of logs || []) console.log("   ", e.created_at.slice(11, 19), e.status.padEnd(7), String(e.template_type).padEnd(26), e.recipient_email.padEnd(22), e.subject, e.error_message ? "| " + e.error_message : "");
  const { data: q } = await sb.from("outgoing_email_queue").select("created_at,status,trigger_event,to_email,error_message").eq("company_id", COMPANY).gte("created_at", from).order("created_at");
  for (const r of q || []) console.log("    QUEUE", r.created_at.slice(11, 19), r.status.padEnd(9), r.trigger_event, r.to_email, r.error_message ? "| " + r.error_message : "");
};
const pay = async (inv, amount, ref) => JSON.stringify(await asAdmin("POST", `/api/admin/invoices/${inv.id}/mark-paid`, { amount, paymentMethod: "eft", reference: ref, note: `PDF flow test - ${ref}` }));

for (;;) { const m = new Date().getUTCMinutes() % 15, s = new Date().getUTCSeconds(); if (m >= 1 && m <= 9 && !(m === 1 && s < 30)) break; await wait(10000); }

const since = new Date().toISOString();
const q = await newQuote("FLOWOFF", { eventInDays: 30 });
log("quote", q.quote_number);
const acc = await fetch(`${BASE}/api/public/quotes/${q.public_token}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptedByName: "Raj Email Test" }) });
const aj = await acc.json(); log("accept:", acc.status, JSON.stringify(aj));
log("local queue run:", JSON.stringify(await asAdmin("POST", "/api/admin/email-health", {})).slice(0, 200));
await wait(20000);
await report("1. quote accepted", since);
fs.writeFileSync("tmp/email-e2e/FLOW.json", JSON.stringify({ since, quote: q, orderId: aj.orderId }, null, 2));

const { data: inv } = await sb.from("invoices").select("id, invoice_number, total_amount, balance_due, invoice_data").eq("order_id", aj.orderId).order("created_at").limit(1).single();
const deposit = Number(inv.invoice_data?.initialPaymentAmount);
log(`invoice ${inv.invoice_number} total ${inv.total_amount}, deposit ${deposit}`);
const t2 = new Date().toISOString();
log("pay deposit:", await pay(inv, deposit, "FLOWOFF-DEPOSIT"));
await wait(25000);
await report("2. deposit paid", t2);

const { data: inv2 } = await sb.from("invoices").select("id, invoice_number, balance_due").eq("order_id", aj.orderId).gt("balance_due", 0.01).order("created_at").limit(1).maybeSingle();
const t3 = new Date().toISOString();
log(`pay balance ${inv2?.balance_due} on ${inv2?.invoice_number}:`, inv2 ? await pay(inv2, Number(inv2.balance_due), "FLOWOFF-BALANCE") : "nothing due");
await wait(25000);
await report("3. balance paid", t3);
const { data: o } = await sb.from("orders").select("order_number,status,payment_status").eq("id", aj.orderId).single();
log("order:", JSON.stringify(o));
await close();
