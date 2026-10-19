// PDF flow test (accept -> deposit). Test company + rajm267744@gmail.com only.
import fs from "fs";
import { sb, asAdmin, newQuote, close, wait, COMPANY, BASE } from "./lib.mjs";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Start just after a production queue run (every 15 min) so the local run
// handles the booking email first.
for (;;) { const m = new Date().getUTCMinutes() % 15, s = new Date().getUTCSeconds(); if (m >= 1 && m <= 9 && !(m === 1 && s < 30)) break; await wait(10000); }

const since = new Date().toISOString();
const q = await newQuote("FLOW", { eventInDays: 30 });
log("quote", q.quote_number);
const acc = await fetch(`${BASE}/api/public/quotes/${q.public_token}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptedByName: "Raj Email Test" }) });
const aj = await acc.json(); log("accept:", acc.status, JSON.stringify(aj));
log("local queue run:", JSON.stringify(await asAdmin("POST", "/api/admin/email-health", {})));
await wait(20000);

const report = async (label) => {
  const { data: logs } = await sb.from("email_automation_log").select("created_at,status,template_type,subject,error_message").eq("user_id", COMPANY).gte("created_at", since).order("created_at");
  log(`--- emails logged (${label}) ---`); for (const e of logs || []) console.log("   ", e.created_at.slice(11, 19), e.status.padEnd(7), String(e.template_type).padEnd(26), e.subject, e.error_message ? "| " + e.error_message : "");
  const { data: qrows } = await sb.from("outgoing_email_queue").select("created_at,status,trigger_event,subject,error_message").eq("company_id", COMPANY).gte("created_at", since).order("created_at");
  log(`--- queue rows (${label}) ---`); for (const r of qrows || []) console.log("   ", r.created_at.slice(11, 19), r.status.padEnd(9), r.trigger_event, "|", r.subject, r.error_message ? "| " + r.error_message : "");
};
await report("after accept");

const { data: invs } = await sb.from("invoices").select("id, invoice_number, total_amount, amount_paid, balance_due, invoice_type, status").eq("order_id", aj.orderId).order("created_at");
log("invoices:", JSON.stringify(invs));
const dep = invs?.[0];
const depAmount = Number(dep?.balance_due);
log("mark deposit paid:", JSON.stringify(await asAdmin("POST", `/api/admin/invoices/${dep.id}/mark-paid`, { amount: depAmount, paymentMethod: "eft", reference: "FLOW-DEPOSIT", note: "PDF flow test - deposit" })));
await wait(25000);
await report("after deposit");
const { data: invs2 } = await sb.from("invoices").select("id, invoice_number, total_amount, amount_paid, balance_due, status").eq("order_id", aj.orderId).order("created_at");
log("invoices after deposit:", JSON.stringify(invs2));
fs.writeFileSync("tmp/email-e2e/FLOW.json", JSON.stringify({ since, quote: q, orderId: aj.orderId }, null, 2));
await close();
