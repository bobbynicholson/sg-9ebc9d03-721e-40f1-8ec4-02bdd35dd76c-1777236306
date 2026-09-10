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
import { sendRefundPaidEmail } from "@/services/email/cancellationEmails";
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

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    const body = (req.body || {}) as any;
    const paidAt = body.paid_at ? new Date(String(body.paid_at)).toISOString() : new Date().toISOString();
    const notes = body.notes ? String(body.notes) : null;

    const { data: payment } = await ssr
      .from("payments")
      .select("id, company_id, order_id, payment_type, amount, payment_status")
      .eq("id", refundId)
      .maybeSingle();
    if (!payment) return res.status(404).json({ error: "Refund not found" });
    if ((payment as any).payment_type !== "refund") {
      return res.status(400).json({ error: "Not a refund record" });
    }
    // Phase 4B dropped the legacy text `status` mirror; payment_status enum is canonical.
    if ((payment as any).payment_status === "completed") {
      return res.status(409).json({ error: "Refund already marked paid" });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (payment as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Phase 2A migrated reads to payment_status; Phase 4B drops the legacy text column.
    const { error: payErr } = await ssr
      .from("payments")
      .update({
        payment_status: "completed",
        processed_at: paidAt,
        reason: notes
          ? `Refund paid: ${notes}`
          : (payment as any).reason || null,
      } as any)
      .eq("id", refundId);
    if (payErr) return res.status(500).json({ error: dbErrorMessage(payErr) });

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

    // Refund-paid email so the client knows the EFT has gone out.
    if ((payment as any).order_id) {
      void sendRefundPaidEmail((payment as any).order_id, Number((payment as any).amount) || 0);
    }

    return res.status(200).json({ ok: true, refund_id: refundId, processed_at: paidAt });
  } catch (err: any) {
    console.error("[refunds/mark-paid] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Mark refund paid failed" });
  }
}

export default withApiLogging(handler);
