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
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";

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

    const { data: callerProfile, error: callerProfileErr } = await admin
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (callerProfileErr) {
      console.error("[payments/verify-claim] profiles fetch failed:", callerProfileErr);
    }
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
    const { data: invoice, error: invoiceErr } = await admin
      .from("invoices")
      .select("id, total_amount, amount_paid, balance_due, status, invoice_number")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    if (invoiceErr) {
      console.error("[payments/verify-claim] invoices fetch failed:", invoiceErr);
    }
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
        const clientUserId = await resolveClientUserId(admin, payment.client_id);
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
      // Don't unwind the payment update - log and continue, the admin
      // can fix invoice totals manually if this rare path hits.
      console.error("verify-claim: invoice update failed", invErr);
    }

    // Audit gap close: until now the EFT verify path mirrored the
    // PayFast invoice webhook for invoice totals but never flipped the
    // order to `completed`. So a fully-paid EFT order would sit at
    // `confirmed` forever. Mirror the close logic from
    // payment-confirmation.ts: when this verify makes the linked
    // invoice fully paid, close the order out - but only if the order
    // is currently `confirmed`. Skip if it's already `completed` or
    // `cancelled` so we don't undo a cancellation that hit between
    // claim and verify.
    let orderClosed = false;
    let closedOrderId: string | null = null;
    if (isFullyPaid) {
      try {
        // Resolve the order via the invoice (invoice.order_id is the
        // canonical link; payment.order_id is the same value when set,
        // but we trust the invoice as the source of truth here).
        const { data: invForOrder } = await admin
          .from("invoices")
          .select("order_id")
          .eq("id", invoice.id)
          .maybeSingle();
        const invoiceOrderId = (invForOrder as any)?.order_id || null;
        if (invoiceOrderId) {
          const { data: orderRow } = await admin
            .from("orders")
            .select("id, status, company_id, client_id, order_number")
            .eq("id", invoiceOrderId)
            .maybeSingle();
          if (orderRow && orderRow.status === "confirmed") {
            const closedAt = new Date().toISOString();
            const { error: closeErr } = await admin
              .from("orders")
              .update({
                status: "completed",
                payment_status: "paid",
                completed_at: closedAt,
                updated_at: closedAt,
              })
              .eq("id", orderRow.id);
            if (closeErr) {
              // Log but never unwind the verify - the admin can flip
              // the order to completed manually if this rare branch hits.
              console.error("verify-claim: order close failed", closeErr);
            } else {
              orderClosed = true;
              closedOrderId = orderRow.id;

              // Client in-app: "your order is wrapped, payment confirmed".
              try {
                const clientUserId = await resolveClientUserId(admin, orderRow.client_id);
                if (clientUserId) {
                  await admin.from("notifications").insert({
                    company_id: orderRow.company_id,
                    recipient_id: clientUserId,
                    user_id: clientUserId,
                    notification_type: "order_completed",
                    title: "Order completed",
                    message: `Order ${orderRow.order_number} is fully paid and wrapped up. Thanks for booking with us.`,
                    priority: "normal",
                    link: `/client-portal?orderId=${orderRow.id}`,
                    related_entity_type: "order",
                    related_entity_id: orderRow.id,
                    channels: ["in_app"],
                  });
                }
              } catch (e) {
                console.warn("verify-claim: client order-completed notify failed", e);
              }

              // Owner in-app inbox row so the dashboard reflects the close.
              try {
                const { data: companyRow } = await admin
                  .from("companies")
                  .select("owner_id")
                  .eq("id", orderRow.company_id)
                  .maybeSingle();
                const ownerId = (companyRow as any)?.owner_id || null;
                if (ownerId) {
                  await admin.from("notifications").insert({
                    company_id: orderRow.company_id,
                    recipient_id: ownerId,
                    user_id: ownerId,
                    notification_type: "order_completed",
                    title: `Order ${orderRow.order_number} closed out`,
                    message: `EFT verification cleared the final balance. Order is now completed.`,
                    priority: "normal",
                    link: `/admin/orders?orderId=${orderRow.id}`,
                    related_entity_type: "order",
                    related_entity_id: orderRow.id,
                    channels: ["in_app"],
                  });
                }
              } catch (e) {
                console.warn("verify-claim: owner order-completed notify failed", e);
              }
            }
          }
        }
      } catch (e) {
        // Outer guard - closing the order must never roll back a
        // successful verification.
        console.error("verify-claim: order close branch threw", e);
      }
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
          title: "Payment received - thanks",
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
      order_closed: orderClosed,
      order_id: closedOrderId,
    });
  } catch (e: any) {
    console.error("verify-claim crashed:", e);
    return res.status(500).json({ error: e?.message || "Unexpected server error" });
  }
}
