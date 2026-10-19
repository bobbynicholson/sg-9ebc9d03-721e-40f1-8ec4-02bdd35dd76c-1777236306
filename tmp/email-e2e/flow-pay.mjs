// PDF flow test, payment step: node flow-pay.mjs deposit|balance
import fs from "fs";
import { sb, asAdmin, close, wait, COMPANY } from "./lib.mjs";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const step = process.argv[2];
const { since, orderId } = JSON.parse(fs.readFileSync("tmp/email-e2e/FLOW.json", "utf8"));
const stepSince = new Date().toISOString();
const invList = async () => (await sb.from("invoices").select("id, invoice_number, total_amount, amount_paid, balance_due, status, created_at").eq("order_id", orderId).order("created_at")).data || [];
const before = await invList();
log("invoices before:", JSON.stringify(before.map(({ id, ...r }) => r)));
const target = before.find((i) => Number(i.balance_due) > 0.01);
if (!target) { log("nothing left to pay"); process.exit(); }
log(`mark ${step} paid on ${target.invoice_number}:`, JSON.stringify(await asAdmin("POST", `/api/admin/invoices/${target.id}/mark-paid`, { amount: Number(target.balance_due), paymentMethod: "eft", reference: `FLOW-${step.toUpperCase()}`, note: `PDF flow test - ${step}` })));
await wait(25000);
const { data: logs } = await sb.from("email_automation_log").select("created_at,status,template_type,subject,error_message").eq("user_id", COMPANY).gte("created_at", stepSince).order("created_at");
log(`--- emails logged during ${step} ---`); for (const e of logs || []) console.log("   ", e.created_at.slice(11, 19), e.status.padEnd(7), String(e.template_type).padEnd(26), e.subject, e.error_message ? "| " + e.error_message : "");
const { data: q } = await sb.from("outgoing_email_queue").select("created_at,status,trigger_event,subject").eq("company_id", COMPANY).gte("created_at", stepSince);
log(`--- queue rows during ${step} ---`); for (const r of q || []) console.log("   ", r.created_at.slice(11, 19), r.status, r.trigger_event, "|", r.subject);
log("invoices after:", JSON.stringify((await invList()).map(({ id, ...r }) => r)));
const { data: o } = await sb.from("orders").select("order_number,status,payment_status").eq("id", orderId).single();
log("order:", JSON.stringify(o));
await close();
