/* eslint-disable @typescript-eslint/no-explicit-any */
import { emailService } from "@/services/emailService";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}
export async function drainPaymentReceipts(admin: any, limit = 10) {
  const { data: jobs, error } = await admin.rpc("claim_payment_receipts", { p_limit: limit });
  if (error) throw error;
  let delivered = 0;
  const errors: string[] = [];
  for (const job of jobs || []) {
    try {
      const notified = await admin.rpc("deliver_payment_receipt_in_app", { p_receipt_id: job.id });
      if (notified.error) throw notified.error;
      const snapshot = job.payload || {};
      const reference = String(snapshot.reference || "your invoice");
      const money = (value: unknown) => {
        try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency: snapshot.currency || "ZAR" }).format(Number(value || 0)); }
        catch { return `${snapshot.currency} ${Number(value || 0).toFixed(2)}`; }
      };
      const subject = job.kind === "received" ? `Payment received for ${reference}`
        : job.kind === "refunded" ? `Refund processed for ${reference}`
        : job.kind === "claimed" ? `EFT needs verification for ${reference}` : `EFT could not be matched for ${reference}`;
      const summary = job.kind === "received"
        ? `Payment received: ${money(snapshot.amount)}. Total: ${money(snapshot.total_amount)}. Paid to date: ${money(snapshot.amount_paid)}. Remaining balance: ${money(snapshot.balance_due)}.`
        : job.kind === "refunded" ? `Refund recorded: ${money(snapshot.amount)}. Your bank or provider may take time to reflect the funds.`
        : job.kind === "claimed" ? `A client claims to have paid ${money(snapshot.amount)}. Check your bank statement before confirming.`
        : `Your EFT could not be matched. ${snapshot.notes || "Please contact the company with your bank reference."}`;
      const body = `<p>${escapeHtml(reference)}</p><p>${escapeHtml(summary)}</p><p>${escapeHtml(snapshot.company_name)}</p>`;
      // The snapshot is immutable across retries. Each destination has its
      // own checkpoint and provider key. SMTP is necessarily at-least-once
      // if a process dies after sending but before saving the checkpoint.
      for (const destination of ["client", "owner"] as const) {
        const field = destination === "client" ? "client_email_sent_at" : "owner_email_sent_at";
        if (job[field]) continue;
        const needed = destination === "client" ? job.kind !== "claimed" : job.kind !== "rejected";
        const to = destination === "client" ? snapshot.client_email : snapshot.company_email;
        if (needed && to) {
          const result = await emailService.sendEmailDetailed({ companyId: job.company_id, to, subject, body,
            notificationPreference: "payment_received", idempotencyKey: `payment-receipt/${job.id}/${destination}`,
            _client: admin });
          // A deliberate preference/contact suppression is a final delivery
          // decision, not a transport failure to retry indefinitely.
          if (!result.success && !["notification_disabled", "blocked_recipient", "quarantined_recipient"].includes(String(result.error_code))) {
            throw new Error(result.error || "Receipt delivery failed");
          }
        }
        const saved = await admin.from("payment_receipt_outbox").update({ [field]: new Date().toISOString() }).eq("id", job.id);
        if (saved.error) throw saved.error;
      }
      const saved = await admin.from("payment_receipt_outbox").update({ delivered_at: new Date().toISOString(),
        claimed_until: null, last_error: null }).eq("id", job.id);
      if (saved.error) throw saved.error;
      delivered += 1;
    } catch (failure: any) {
      errors.push(`receipt ${job.id}: ${failure.message}`);
      const saved = await admin.from("payment_receipt_outbox").update({ last_error: String(failure.message).slice(0, 500),
        claimed_until: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6))).toISOString() }).eq("id", job.id);
      if (saved.error) throw saved.error;
    }
  }
  return { delivered, errors };
}
