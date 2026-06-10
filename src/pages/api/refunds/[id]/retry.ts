/**
 * POST /api/refunds/[id]/retry
 *
 * Re-runs refundService.processRefund for a refund that's still
 * pending. Used by the "Retry refund" button on /admin/refunds when a
 * PayFast auto-refund failed the first time (network blip, gateway
 * 5xx, credentials briefly missing).
 *
 * Body: ignored. The orchestration looks at the parent payment to
 * decide whether to call PayFast or stay pending-manual.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { refundService } from "@/services/refundService";
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
    if (ps === "completed") {
      return res.status(409).json({ error: "Refund already completed" });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (payment as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }

    const result = await refundService.processRefund(refundId, user.id);
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[refunds/retry] crashed:", err);
    return res.status(500).json({ error: err?.message || "Retry refund failed" });
  }
}

export default withApiLogging(handler);
