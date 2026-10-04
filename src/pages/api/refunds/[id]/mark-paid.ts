/**
 * POST /api/refunds/[id]/mark-paid
 *
 * Admin marks a pending refund as paid (typically after running the
 * EFT). Updates the payments row + the order's payment_status, and
 * stamps audit fields.
 *
 * Body: { paid_at?: string (ISO), notes?: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";


const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const refundId = String(req.query.id || "");
    if (!refundId) return res.status(400).json({ error: "Refund id is required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileError } = await ssr
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return res.status(503).json({ error: "Could not verify refund permission" });
    const role = String(profile?.role || "");
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    const body = (req.body || {}) as any;
    const paidDate = body.paid_at ? new Date(String(body.paid_at)) : new Date();
    if (!Number.isFinite(paidDate.getTime())) return res.status(400).json({ error: "Invalid refund payment date" });
    const paidAt = paidDate.toISOString();
    const notes = body.notes ? String(body.notes) : null;

    const { data: payment } = await ssr
      .from("payments")
      .select("id, company_id, order_id, payment_type, amount, payment_status, processed_at, reason")
      .eq("id", refundId)
      .maybeSingle();
    if (!payment) return res.status(404).json({ error: "Refund not found" });
    if ((payment as any).payment_type !== "refund") {
      return res.status(400).json({ error: "Not a refund record" });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (payment as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }
    // A provider refund may be processing with an unknown outcome. Never
    // permit manual confirmation to race or overwrite that operation.
    if (payment.payment_status === "completed") {
      return res.status(200).json({ ok: true, duplicate: true, refund_id: refundId, processed_at: payment.processed_at });
    }
    if (!["pending", "failed"].includes(payment.payment_status)) {
      return res.status(409).json({ error: "This refund is already processing or resolved. Reconcile its provider status before taking another action." });
    }

    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      return res.status(400).json({ error: "Refund amount must be positive and have at most two decimal places" });
    }

    // Phase 2A migrated reads to payment_status; Phase 4B drops the legacy text column.
    const { data: updated, error: payErr } = await ssr
      .from("payments")
      .update({
        payment_status: "completed",
        processed_at: paidAt,
        refunded_at: paidAt,
        reason: notes
          ? `Refund paid: ${notes}`
          : (payment as any).reason || null,
      } as any)
      .eq("id", refundId)
      .eq("company_id", payment.company_id)
      .eq("payment_status", payment.payment_status)
      .select("id")
      .maybeSingle();
    if (payErr) return res.status(500).json({ error: dbErrorMessage(payErr) });
    if (!updated) return res.status(409).json({ error: "Another action is already processing this refund. Refresh before continuing." });

    // Audit log entry so the dashboard can show "refund of R4,500 paid
    // by Bobby on 2026-05-04".
    try {
      await ssr.from("audit_logs").insert({
        company_id: (payment as any).company_id,
        user_id: user.id,
        action: "refund_paid",
        entity_type: "payment",
        entity_id: refundId,
        details: {
          order_id: (payment as any).order_id,
          amount: (payment as any).amount,
          notes,
        },
      } as any);
    } catch (e) {
      console.warn("[refunds/mark-paid] audit insert failed", e);
    }

    // The database trigger queues the refund receipt in this same commit.

    return res.status(200).json({ ok: true, refund_id: refundId, processed_at: paidAt });
  } catch (err: any) {
    console.error("[refunds/mark-paid] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Mark refund paid failed" });
  }
}

export default withApiLogging(handler);
