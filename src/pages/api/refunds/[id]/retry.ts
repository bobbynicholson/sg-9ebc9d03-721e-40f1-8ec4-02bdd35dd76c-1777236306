/**
 * POST /api/refunds/[id]/retry
 *
 * Re-runs refundService.processRefund for a refund that's still
 * pending or definitively failed. Used by the "Retry refund" button
 * after a rejected request or configuration error. Uncertain network
 * or provider outcomes remain processing and require reconciliation.
 *
 * Body: ignored. The orchestration looks at the parent payment to
 * decide whether to call PayFast or stay pending-manual.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { refundService } from "@/services/refundService";
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

    // Caller-company check via SSR client (RLS will already gate this,
    // but the explicit check gives a clean 403 instead of "not found").
    const { data: payment } = await ssr
      .from("payments")
      .select("id, company_id, payment_type, payment_status")
      .eq("id", refundId)
      .maybeSingle();
    if (!payment) return res.status(404).json({ error: "Refund not found" });
    if ((payment as any).payment_type !== "refund") {
      return res.status(400).json({ error: "Not a refund record" });
    }
    // Phase 4B dropped the legacy text `status` mirror; payment_status enum is canonical.
    const ps = String((payment as any).payment_status || "");
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (payment as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }
    if (ps === "completed") return res.status(200).json({ ok: true, status: "already_completed", refund_payment_id: refundId });
    if (!["pending", "failed"].includes(ps)) return res.status(409).json({ error: "This refund is already processing or resolved. Check its provider outcome before retrying." });

    const result = await refundService.processRefund(refundId, user.id);
    const ok = ["auto_processed", "pending_manual", "already_completed"].includes(result.status);
    return res.status(ok ? 200 : result.status === "pending_reconciliation" ? 409 : 503).json({ ok, ...result });
  } catch (err: any) {
    console.error("[refunds/retry] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Retry refund failed" });
  }
}

export default withApiLogging(handler);
