/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/claim-eft
 *
 * The client side of the EFT confirmation handshake. The user clicks
 * "I've made the EFT payment" on the portal billing page; we:
 *
 *   1. Verify the caller is signed in and owns the invoice (via the
 *      clients.user_id link under the invoice's tenant).
 *   2. Insert a payments row scoped to the invoice with status=pending
 *      and method=eft. The reference is forced to invoice_number --
 *      the entire point of the flow is making the reference correct.
 *   3. Notify every admin/owner of the catering company so reconciliation
 *      against the bank statement gets triaged fast.
 *
 * We never auto-credit. The admin still confirms via the verify-claim
 * surface after they've eyeballed the bank statement; only that step
 * transitions the payment to completed and updates the invoice.
 *
 * Security:
 *   - Service role used so notifications can be inserted across users
 *     and the payment row can land regardless of any quirks in the
 *     payments INSERT policy. Ownership is checked in code first.
 *   - The amount the client claims is recorded but is informational --
 *     it doesn't move money or update invoice.amount_paid.
 *   - Idempotent on duplicate clicks: if the most recent pending claim
 *     for this invoice is younger than 60 seconds we return it
 *     unchanged rather than inserting a second row.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";


const fmtMoney = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: "Sign in first" });
    }

    const { invoice_id, claimed_amount, claimed_paid_at, notes } = req.body || {};
    if (typeof invoice_id !== "string" || !/^[0-9a-f-]{36}$/i.test(invoice_id)) {
      return res.status(400).json({ error: "Invalid invoice" });
    }
    const amount = Number(claimed_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Claimed amount must be positive" });
    }
    const paidAt = typeof claimed_paid_at === "string" && claimed_paid_at.length > 0
      ? new Date(claimed_paid_at)
      : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return res.status(400).json({ error: "Invalid payment date" });
    }
    const trimmedNotes = typeof notes === "string" ? notes.trim().slice(0, 500) : null;

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve the invoice and confirm the caller owns it. Ownership is
    // "you have a clients row under this tenant linked to your user_id
    // and that clients row is the one referenced by the invoice." The
    // RLS on invoices already enforces this for direct reads, but we
    // re-check server-side because we're using the service role.
    const { data: invoice, error: invErr } = await admin
      .from("invoices")
      .select("id, company_id, client_id, invoice_number, total_amount, balance_due, status, deleted_at")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !invoice || invoice.deleted_at) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (invoice.status === "paid") {
      return res.status(409).json({ error: "Invoice is already marked paid" });
    }

    const { data: ownership, error: ownershipErr } = await admin
      .from("clients")
      .select("id")
      .eq("id", invoice.client_id)
      .eq("user_id", user.id)
      .eq("company_id", invoice.company_id)
      .maybeSingle();
    if (ownershipErr) {
      console.error("[payments/claim-eft] clients fetch failed:", ownershipErr);
    }
    if (!ownership) {
      return res.status(403).json({ error: "Not your invoice" });
    }

    // Idempotency - treat very recent duplicate clicks as the same
    // claim so a flaky network doesn't spam admin notifications.
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recentClaim, error: recentClaimErr } = await admin
      .from("payments")
      .select("id, payment_status, created_at")
      .eq("invoice_id", invoice.id)
      .eq("payment_method", "eft")
      .eq("payment_status", "pending")
      .gte("created_at", sixtySecondsAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentClaimErr) {
      console.error("[payments/claim-eft] payments fetch failed:", recentClaimErr);
    }
    if (recentClaim) {
      return res.status(200).json({ ok: true, payment_id: recentClaim.id, deduped: true });
    }

    // Insert the pending payment row. Reference is forced to the
    // invoice_number - this is the contract the client is told to
    // honour in their banking app.
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .insert({
        company_id: invoice.company_id,
        client_id: invoice.client_id,
        invoice_id: invoice.id,
        payment_reference: invoice.invoice_number,
        payment_method: "eft",
        payment_status: "pending",
        amount,
        currency: "ZAR",
        payment_date: paidAt.toISOString(),
        notes: trimmedNotes,
      })
      .select("id")
      .single();
    if (payErr || !payment) {
      console.error("claim-eft: payment insert failed", payErr);
      return res.status(500).json({ error: dbErrorMessage(payErr) || "Could not record claim" });
    }

    // Notify every admin/owner under this tenant. We fan out one row
    // per recipient because the notifications table has a recipient_id
    // column (per-user inbox), not just a company-wide bus.
    try {
      const { data: recipients } = await admin
        .from("profiles")
        .select("id")
        .eq("company_id", invoice.company_id)
        .in("role", ["company_admin", "admin", "sales_admin", "region_admin"]);
      const recipientIds = ((recipients as any[]) || []).map((r) => r.id);
      if (recipientIds.length > 0) {
        const summary = trimmedNotes
          ? ` Note from client: "${trimmedNotes.slice(0, 120)}${trimmedNotes.length > 120 ? "…" : ""}"`
          : "";
        const rows = recipientIds.map((rid) => ({
          company_id: invoice.company_id,
          recipient_id: rid,
          user_id: rid,
          notification_type: "payment_claimed",
          title: "💸 Client says they've paid",
          message:
            `${fmtMoney.format(amount)} for ${invoice.invoice_number}. ` +
            `Reference: ${invoice.invoice_number}. Check your bank account.${summary}`,
          priority: "high",
          // Include both invoiceId and claimId so the PendingClaimsBanner
          // on /admin/invoices can scroll to and pulse the specific
          // claim that fired this notification, not just any pending one.
          link: `/admin/invoices?invoiceId=${encodeURIComponent(invoice.id)}&claimId=${encodeURIComponent(payment.id)}`,
          related_entity_type: "invoice",
          related_entity_id: invoice.id,
          channels: ["in_app"],
        }));
        await admin.from("notifications").insert(rows);
      }
    } catch (notifyErr) {
      // Notifications failing must not block the claim itself --
      // the payment row is the source of truth.
      console.error("claim-eft: notification fanout failed", notifyErr);
    }

    return res.status(201).json({ ok: true, payment_id: payment.id });
  } catch (e: any) {
    console.error("claim-eft crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
