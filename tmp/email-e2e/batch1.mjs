import { asAdmin, asClient, newOrder, newQuote, emailsSince, sb, close, wait, COMPANY } from "./lib.mjs";

const since = new Date().toISOString();
const log = (...a) => console.log(...a);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// 1. Change request approved + declined
const d1 = await newOrder("D1");
log("D1 order", d1.order.order_number);
let r = await asClient(d1.order.id, "POST", "/api/client-tokens/amend-order", { order_id: d1.order.id, proposed_changes: { guest_count: 36 }, client_notes: "Approve test" });
log("  change request #1:", r.status, r.body);
const req1 = JSON.parse(r.body).request_id;
log("  approve:", JSON.stringify(await asAdmin("POST", "/api/orders/amendment-review", { request_id: req1, action: "approve", review_notes: "Approved (email test)" })));
r = await asClient(d1.order.id, "POST", "/api/client-tokens/amend-order", { order_id: d1.order.id, proposed_changes: { guest_count: 50 }, client_notes: "Decline test" });
const req2 = JSON.parse(r.body).request_id;
log("  change request #2:", r.status);
log("  decline:", JSON.stringify(await asAdmin("POST", "/api/orders/amendment-review", { request_id: req2, action: "reject", review_notes: "Declined (email test)" })));

// 2. Deposit paid -> receipt; then cancellation -> approved -> refund paid
const d2 = await newOrder("D2");
log("D2 order", d2.order.order_number);
const { data: inv2 } = await sb.from("invoices").select("id, invoice_number, balance_due").eq("order_id", d2.order.id).order("created_at").limit(1).single();
log("  mark deposit invoice paid:", JSON.stringify(await asAdmin("POST", `/api/admin/invoices/${inv2.id}/mark-paid`, { amount: inv2.balance_due, paymentMethod: "eft", reference: "EMAIL-TEST", note: "email test" })));
r = await asClient(d2.order.id, "POST", "/api/client-tokens/cancel-order", { order_id: d2.order.id, request_type: "cancel", reason: "Email test", client_notes: "Cancel test" });
log("  cancel request:", r.status, r.body);
await wait(2000);
const { data: creq } = await sb.from("order_cancellation_requests").select("id, status").eq("order_id", d2.order.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
log("  approve cancellation:", JSON.stringify(await asAdmin("POST", "/api/orders/cancellation-review", { request_id: creq?.id, action: "approve", review_notes: "Approved (email test)" })));
await wait(3000);
const { data: refund } = await sb.from("refunds").select("id, status, amount").eq("order_id", d2.order.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
log("  refund row:", JSON.stringify(refund));
if (refund) log("  mark refund paid:", JSON.stringify(await asAdmin("POST", `/api/refunds/${refund.id}/mark-paid`, { notes: "email test" })));

// 3. Postponement request -> approved
const d3 = await newOrder("D3", { eventInDays: 30 });
log("D3 order", d3.order.order_number);
r = await asClient(d3.order.id, "POST", "/api/client-tokens/cancel-order", { order_id: d3.order.id, request_type: "postpone", requested_postpone_date: day(45), reason: "Email test", client_notes: "Postpone test" });
log("  postpone request:", r.status, r.body);
await wait(2000);
const { data: preq } = await sb.from("order_cancellation_requests").select("id").eq("order_id", d3.order.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
log("  approve postponement:", JSON.stringify(await asAdmin("POST", "/api/orders/cancellation-review", { request_id: preq?.id, action: "approve", review_notes: "Approved (email test)" })));

// 4. Quote declined (admin marks a sent quote lost)
const lost = await newQuote("LOST");
log("Quote declined:", lost.quote_number, JSON.stringify(await asAdmin("POST", `/api/admin/quotes/${lost.id}/mark-lost`, { lost_reason: "price", reason_note: "Email test", notify_client: true })));

await wait(12000);
const rows = await emailsSince(since);
for (const e of rows) log(e.created_at.slice(11, 19), e.status.padEnd(6), e.recipient_email.padEnd(22), e.subject, e.error_message ? "| " + e.error_message : "");
log("total:", rows.length);
await close();
