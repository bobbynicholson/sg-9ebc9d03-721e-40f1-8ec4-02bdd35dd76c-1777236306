/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/verify-claim
 *
 * Admin action paired with /api/payments/claim-eft. The admin opens the
 * pending-claims banner, eyeballs the bank statement, and confirms (or
 * rejects) the client's claimed EFT payment. We:
 *
 *   - Confirm path: payment.status=completed, payment.processed_at=now,
 *     bump invoice.amount_paid, recompute balance_due, flip
 *     invoice.status to paid when balance hits zero (or partially_paid
 *     if amount left over). The client portal Billing tab picks up the
 *     change on its next load.
 *
 *   - Reject path: payment.status=failed, payment.failed_at=now, append
 *     the admin's reason to notes. The invoice is untouched. Client is
 *     notified so they can fix the reference and re-submit.
 *
 * Auth: admin of the same company as the payment. We don't allow a
 * client to confirm their own claim because that's the whole point of
 * the reconciliation step.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

const ADMIN_ROLES = new Set([
  "company_admin", "admin", "sales_admin", "region_admin", "super_admin",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: "Sign in first" });
    }

    const { payment_id, action, reason } = req.body || {};
    if (typeof payment_id !== "string" || !/^[0-9a-f-]{36}$/i.test(payment_id)) {
      return res.status(400).json({ error: "Invalid payment id" });
    }
    if (action !== "confirm" && action !== "reject") {
      return res.status(400).json({ error: "Action must be confirm or reject" });
    }
    const trimmedReason = typeof reason === "string" ? reason.trim().slice(0, 500) : "";

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve the payment + invoice and check the caller is an admin
    // of the same company.
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, company_id, invoice_id, client_id, amount, payment_status, payment_method, payment_reference, notes")
      .eq("id", payment_id)
      .maybeSingle();
    if (payErr || !payment) {
      return res.status(404).json({ error: "Payment not found" });
    }
    if (payment.payment_status !== "pending") {
      return res.status(409).json({ error: `Already ${payment.payment_status}` });
    }
    if (!payment.invoice_id) {
      return res.status(400).json({ error: "Payment has no invoice link" });
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const callerRole = callerProfile?.role as string | undefined;
    const isSuperAdmin = callerRole === "super_admin";
    if (!callerRole || !ADMIN_ROLES.has(callerRole)) {
      return res.status(403).json({ error: "Admin only" });
    }
    if (!isSuperAdmin && callerProfile?.company_id !== payment.company_id) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Resolve the invoice once; we need it on both branches for
    // the response and (on confirm) for the totals math.
    const { data: invoice } = await admin
      .from("invoices")
      .select("id, total_amount, amount_paid, balance_due, status, invoice_number")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // ── Reject branch ──────────────────────────────────────────────
    if (action === "reject") {
      const appended = [
        payment.notes,
        trimmedReason ? `Rejected by admin: ${trimmedReason}` : "Rejected by admin.",
      ].filter(Boolean).join("\n");

      const { error: rejErr } = await admin
        .from("payments")
        .update({
          payment_status: "failed",
          failed_at: new Date().toISOString(),
          notes: appended,
        })
        .eq("id", payment.id);
      if (rejErr) {
        return res.status(500).json({ error: rejErr.message });
      }

      // Notify the client so they can fix the reference and try again.
      try {
        const { data: clientProfile } = await admin
          .from("clients")
          .select("user_id")
          .eq("id", payment.client_id)
          .maybeSingle();
        const clientUserId = (clientProfile as any)?.user_id;
        if (clientUserId) {
          await admin.from("notifications").insert({
            company_id: payment.company_id,
            recipient_id: clientUserId,
            user_id: clientUserId,
            notification_type: "payment_rejected",
            title: "Payment couldn't be matched",
            message:
              `Your EFT for ${invoice.invoice_number} couldn't be reconciled.` +
              (trimmedReason ? ` Reason: ${trimmedReason}` : "") +
              " Use the reference shown on the invoice and try again.",
            priority: "high",
            link: "/client-portal/billing",
            related_entity_type: "invoice",
            related_entity_id: invoice.id,
            channels: ["in_app"],
          });
        }
      } catch (e) {
        console.error("verify-claim: client notify on reject failed", e);
      }

      return res.status(200).json({ ok: true, action: "rejected" });
    }

    // ── Confirm branch ─────────────────────────────────────────────
    const total = Number(invoice.total_amount || 0);
    const previouslyPaid = Number(invoice.amount_paid || 0);
    const newPaid = previouslyPaid + Number(payment.amount || 0);
    const newBalance = Math.max(total - newPaid, 0);
    const isFullyPaid = newBalance <= 0.005; // float guard
    const newInvoiceStatus = isFullyPaid
      ? "paid"
      : newPaid > 0
        ? "partially_paid"
        : invoice.status;

    const { error: confErr } = await admin
      .from("payments")
      .update({
        payment_status: "completed",
        processed_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    if (confErr) {
      return res.status(500).json({ error: confErr.message });
    }

    const { error: invErr } = await admin
      .from("invoices")
      .update({
        amount_paid: newPaid,
        balance_due: newBalance,
        status: newInvoiceStatus,
        paid_at: isFullyPaid ? new Date().toISOString() : null,
      })
      .eq("id", invoice.id);
    if (invErr) {
      // Don't unwind the payment update -- log and continue, the admin
      // can fix invoice totals manually if this rare path hits.
      console.error("verify-claim: invoice update failed", invErr);
    }

    // Notify the client so they see "Paid" on the portal and don't
    // panic-pay again.
    try {
      const { data: clientProfile } = await admin
        .from("clients")
        .select("user_id")
        .eq("id", payment.client_id)
        .maybeSingle();
      const clientUserId = (clientProfile as any)?.user_id;
      if (clientUserId) {
        await admin.from("notifications").insert({
          company_id: payment.company_id,
          recipient_id: clientUserId,
          user_id: clientUserId,
          notification_type: "payment_received",
          title: "Payment received -- thanks",
          message:
            `We've matched your EFT against ${invoice.invoice_number}. ` +
            (isFullyPaid
              ? "The invoice is fully paid."
              : `Outstanding balance: R${newBalance.toLocaleString()}.`),
          priority: "normal",
          link: "/client-portal/billing",
          related_entity_type: "invoice",
          related_entity_id: invoice.id,
          channels: ["in_app"],
        });
      }
    } catch (e) {
      console.error("verify-claim: client notify on confirm failed", e);
    }

    return res.status(200).json({
      ok: true,
      action: "confirmed",
      invoice_status: newInvoiceStatus,
      balance_due: newBalance,
    });
  } catch (e: any) {
    console.error("verify-claim crashed:", e);
    return res.status(500).json({ error: e?.message || "Unexpected server error" });
  }
}
