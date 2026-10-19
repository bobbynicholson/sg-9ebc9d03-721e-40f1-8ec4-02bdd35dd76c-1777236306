// Same 18 emails with "Send automatic emails" OFF for the test company.
import { asAdmin, asClient, newOrder, newQuote, emailsSince, setAutomatic, sb, close, wait, BASE, COMPANY } from "./lib.mjs";
import { execFileSync } from "child_process";
import fs from "fs";

const log = (...a) => console.log(...a);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const json = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

await setAutomatic(false);
const { data: row } = await sb.from("email_provider_settings").select("automation_preferences").eq("company_id", COMPANY).neq("provider", "mailchimp").single();
log("settings:", JSON.stringify(row.automation_preferences));
const since = new Date().toISOString();

// Booking + payments + cancellation + refund on one order
const a = await newOrder("OFF-A");
log("OFF-A", a.order.order_number, "(deposit invoice email expected: NOT sent)");
let r = await asClient(a.order.id, "POST", "/api/client-tokens/amend-order", { order_id: a.order.id, proposed_changes: { guest_count: 36 }, client_notes: "Off test" });
log("  change request", r.status, "approve:", (await asAdmin("POST", "/api/orders/amendment-review", { request_id: json(r).request_id, action: "approve" })).status);
r = await asClient(a.order.id, "POST", "/api/client-tokens/amend-order", { order_id: a.order.id, proposed_changes: { guest_count: 60 }, client_notes: "Off test 2" });
log("  change request 2", r.status, "decline:", (await asAdmin("POST", "/api/orders/amendment-review", { request_id: json(r).request_id, action: "reject" })).status);
const { data: inv } = await sb.from("invoices").select("id, total_amount").eq("order_id", a.order.id).order("created_at").limit(1).single();
const dep = Math.round(Number(inv.total_amount) * 0.3 * 100) / 100;
log("  deposit paid:", (await asAdmin("POST", `/api/admin/invoices/${inv.id}/mark-paid`, { amount: dep, paymentMethod: "eft", reference: "OFF-DEP" })).status);
log("  rest paid:", (await asAdmin("POST", `/api/admin/invoices/${inv.id}/mark-paid`, { amount: Math.round((Number(inv.total_amount) - dep) * 100) / 100, paymentMethod: "eft", reference: "OFF-BAL" })).status);
r = await asClient(a.order.id, "POST", "/api/client-tokens/cancel-order", { order_id: a.order.id, request_type: "cancel", reason: "Off test" });
const ap = await asAdmin("POST", "/api/orders/cancellation-review", { request_id: json(r).request_id, action: "approve" });
log("  cancel request", r.status, "approve:", ap.status);
const refundId = json(ap).refund_payment_id;
await wait(3000);
if (refundId) log("  refund paid:", (await asAdmin("POST", `/api/refunds/${refundId}/mark-paid`, { notes: "off test" })).status);

// Postponement
const b = await newOrder("OFF-B", { eventInDays: 30 });
r = await asClient(b.order.id, "POST", "/api/client-tokens/cancel-order", { order_id: b.order.id, request_type: "postpone", requested_postpone_date: day(60), reason: "Off test" });
log("OFF-B", b.order.order_number, "postpone request", r.status, "approve:", (await asAdmin("POST", "/api/orders/cancellation-review", { request_id: json(r).request_id, action: "approve" })).status);

// Client declines a quote
const q = await newQuote("OFF-DECLINE");
const dr = await fetch(`${BASE}/api/public/quotes/${q.public_token}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "price", rejectedByName: "Raj Email Test" }) });
log("quote declined by client:", dr.status);

// Website enquiry
const m = await sb.from("menu_items").select("id").eq("company_id", COMPANY).limit(2);
const er = await fetch(`${BASE}/api/public/embed/ba8d5b03-c912-4a63-981f-538d8e04e06f/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formSlug: "event-quote", payload: { name: "Raj Email Test OFF", email: "rajm267744@gmail.com", phone: "0826411373", event_type: "wedding", event_date: day(41), guest_count: 25, notes: "Off test", menu_item_ids: (m.data || []).map((x) => x.id) } }) });
log("website enquiry:", er.status);

// Sign-in link (always sent)
const sl = await fetch(`${BASE}/api/auth/client-magic-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "rajm267744@gmail.com", company_slug: "raj267748-payfast-test" }) });
log("sign-in link:", sl.status);

// Order statuses through the real order screen: confirmed, prep, ready, on the way, delivered
const s = await newOrder("OFF-STATUS");
await sb.from("orders").update({ status: "pending", event_date: day(0), event_end_date: day(0) }).eq("id", s.order.id).eq("company_id", COMPANY);
fs.writeFileSync("tmp/email-e2e/OFFS.json", JSON.stringify({ order_id: s.order.id }));
await close();
for (const want of ["^Confirmed$", "^In Prep$", "^Ready$", "^In Transit$", "^Delivered$"]) {
  execFileSync("node", ["tmp/email-e2e/status.mjs", "OFFS", want], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const { data } = await sb.from("orders").select("status").eq("id", s.order.id).single();
  log("OFF-STATUS", s.order.order_number, "->", want, "now:", data.status);
}

await wait(15000);
log("\n=== Emails logged during the OFF run ===");
for (const e of await emailsSince(since)) log(e.created_at.slice(11, 19), e.status.padEnd(6), e.recipient_email.padEnd(22), e.subject);
fs.writeFileSync("tmp/email-e2e/off.since", since);
await close();
