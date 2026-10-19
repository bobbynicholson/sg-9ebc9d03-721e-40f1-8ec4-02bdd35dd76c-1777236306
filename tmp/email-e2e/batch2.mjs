import { asAdmin, newQuote, emailsSince, sb, close, wait, BASE } from "./lib.mjs";
const since = new Date().toISOString();
const log = (...a) => console.log(...a);
// Approve the cancellation (ORD-000005) and postponement (ORD-000006) using the request ids the client got back.
log("approve cancellation:", JSON.stringify(await asAdmin("POST", "/api/orders/cancellation-review", { request_id: "338e639e-6f69-4d68-95e5-db4d9bb4a637", action: "approve", review_notes: "Approved (email test)" })));
log("approve postponement:", JSON.stringify(await asAdmin("POST", "/api/orders/cancellation-review", { request_id: "7f9d79f4-8396-4cf1-bae6-4b075bb24f02", action: "approve", review_notes: "Approved (email test)" })));
await wait(4000);
const { data: o5 } = await sb.from("orders").select("id").eq("company_id", "1417901f-2a08-4fd0-a264-29f47ce371cb").eq("order_number", "ORD-000005").single();
const { data: refunds, error: rerr } = await sb.from("refunds").select("id, status, amount").eq("order_id", o5.id);
log("refunds:", JSON.stringify(refunds), rerr?.message || "");
for (const r of refunds || []) if (r.status !== "paid") log("mark refund paid:", JSON.stringify(await asAdmin("POST", `/api/refunds/${r.id}/mark-paid`, { notes: "email test" })));
// Client declines a quote from the public quote page.
const q = await newQuote("DECLINE");
const res = await fetch(`${BASE}/api/public/quotes/${q.public_token}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "price", reason_note: "Email test", rejectedByName: "Raj Email Test" }) });
log("client declines quote:", q.quote_number, res.status, (await res.text()).slice(0, 200));
await wait(12000);
for (const e of await emailsSince(since)) log(e.created_at.slice(11, 19), e.status.padEnd(6), e.recipient_email.padEnd(22), e.subject, e.error_message ? "| " + e.error_message : "");
await close();
