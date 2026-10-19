import { asAdmin, newOrder, emailsSince, sb, close, wait, BASE, COMPANY } from "./lib.mjs";
import { execFileSync } from "child_process";
import fs from "fs";
const since = new Date().toISOString();
const log = (...a) => console.log(...a);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// 1. Website lead form submitted by a visitor
let r = await fetch(`${BASE}/api/public/embed/ba8d5b03-c912-4a63-981f-538d8e04e06f/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  formSlug: "event-quote",
  payload: { name: "Raj Email Test", email: "rajm267744@gmail.com", phone: "0826411373", event_type: "Wedding", event_date: day(40), guest_count: 25, notes: "Email test enquiry" },
}) });
log("website enquiry:", r.status, (await r.text()).slice(0, 160));

// 2. Client asks for a sign-in link to their portal (always sent)
r = await fetch(`${BASE}/api/auth/client-magic-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "rajm267744@gmail.com", company_slug: "raj267748-payfast-test" }) });
log("client sign-in link:", r.status, (await r.text()).slice(0, 160));

// 3. Part payment: deposit only (30%)
const p = await newOrder("PART");
const { data: inv } = await sb.from("invoices").select("id, invoice_number, total_amount, balance_due").eq("order_id", p.order.id).order("created_at").limit(1).single();
const deposit = Math.round(Number(inv.total_amount) * 0.3 * 100) / 100;
log("part order", p.order.order_number, inv.invoice_number, "pay deposit", deposit, JSON.stringify(await asAdmin("POST", `/api/admin/invoices/${inv.id}/mark-paid`, { amount: deposit, paymentMethod: "eft", reference: "EMAIL-TEST-DEP" })).slice(0, 160));

// 4. Order confirmed + kitchen preparation started, through the real order screen
const s = await newOrder("STATUS");
await sb.from("orders").update({ status: "pending", event_date: day(0), event_end_date: day(0) }).eq("id", s.order.id).eq("company_id", COMPANY);
fs.writeFileSync("tmp/email-e2e/S.json", JSON.stringify({ order_id: s.order.id }));
log("status order", s.order.order_number, "set to pending");
await close();
for (const want of ["^Confirmed$", "^In Prep$"]) {
  const out = execFileSync("node", ["tmp/email-e2e/status.mjs", "S", want], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const { data } = await sb.from("orders").select("status").eq("id", s.order.id).single();
  log("  ->", want, "now:", data.status, out.split("\n").filter((l) => l.startsWith("toasts")).join(" ").slice(0, 120));
}
await wait(12000);
for (const e of await emailsSince(since)) log(e.created_at.slice(11, 19), e.status.padEnd(6), e.recipient_email.padEnd(22), e.subject, e.error_message ? "| " + e.error_message : "");
await close();
