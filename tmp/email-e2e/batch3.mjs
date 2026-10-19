import { asAdmin, asClient, newOrder, emailsSince, sb, close, wait } from "./lib.mjs";
const since = new Date().toISOString();
const log = (...a) => console.log(...a);
// Postponement
const p = await newOrder("P2", { eventInDays: 30 });
let r = await asClient(p.order.id, "POST", "/api/client-tokens/cancel-order", { order_id: p.order.id, request_type: "postpone", requested_postpone_date: new Date(Date.now() + 55 * 864e5).toISOString().slice(0, 10), reason: "Email test" });
log("postpone", p.order.order_number, "approve:", JSON.stringify(await asAdmin("POST", "/api/orders/cancellation-review", { request_id: JSON.parse(r.body).request_id, action: "approve" })).slice(0, 120));
// Cancellation with refund, then refund paid
const c = await newOrder("C2");
const { data: inv } = await sb.from("invoices").select("id, balance_due").eq("order_id", c.order.id).order("created_at").limit(1).single();
log("deposit paid:", JSON.stringify(await asAdmin("POST", `/api/admin/invoices/${inv.id}/mark-paid`, { amount: inv.balance_due, paymentMethod: "eft", reference: "EMAIL-TEST" })).slice(0, 100));
r = await asClient(c.order.id, "POST", "/api/client-tokens/cancel-order", { order_id: c.order.id, request_type: "cancel", reason: "Email test" });
const ap = await asAdmin("POST", "/api/orders/cancellation-review", { request_id: JSON.parse(r.body).request_id, action: "approve" });
log("cancel", c.order.order_number, "approve:", ap.body.slice(0, 160));
const refundId = JSON.parse(ap.body).refund_payment_id;
await wait(4000);
if (refundId) log("refund paid:", JSON.stringify(await asAdmin("POST", `/api/refunds/${refundId}/mark-paid`, { notes: "email test" })).slice(0, 160));
await wait(15000);
for (const e of await emailsSince(since)) log(e.created_at.slice(11, 19), e.status.padEnd(6), e.recipient_email.padEnd(22), e.subject, e.error_message ? "| " + e.error_message : "");
await close();
