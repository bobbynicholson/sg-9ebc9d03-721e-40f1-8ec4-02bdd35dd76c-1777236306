import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

// Records verified merchant evidence. This endpoint never issues a payout.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const { data: profile, error: profileError } = await ssr.from("profiles")
      .select("role, company_id").eq("id", user.id).maybeSingle();
    if (profileError) return res.status(503).json({ error: "Could not verify refund permission" });
    if (!["super_admin", "owner", "company_admin", "admin"].includes(String(profile?.role))) {
      return res.status(403).json({ error: "Admin or owner only" });
    }
    const id = req.query.id;
    const body = req.body || {};
    const reference = typeof body.provider_reference === "string" ? body.provider_reference.trim() : "";
    const evidence = typeof body.evidence === "string" ? body.evidence.trim() : "";
    const paidAt = body.paid_at === undefined ? new Date() : new Date(body.paid_at);
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      body.provider_verified !== true || !["paid", "failed"].includes(body.outcome) ||
      reference.length < 3 || reference.length > 255 || evidence.length < 10 || evidence.length > 2000 ||
      !Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now() + 300000) {
      return res.status(400).json({ error: "Confirm the provider outcome and supply its reference and evidence" });
    }
    const admin = getServiceSupabase();
    const { data: payment, error: lookupError } = await admin.from("payments")
      .select("company_id, payment_type").eq("id", id).maybeSingle();
    if (lookupError) return res.status(503).json({ error: "Could not load refund" });
    if (!payment || payment.payment_type !== "refund") return res.status(404).json({ error: "Refund not found" });
    if (profile.role !== "super_admin" && profile.company_id !== payment.company_id) {
      return res.status(403).json({ error: "Wrong company" });
    }
    const { data, error } = await admin.rpc("reconcile_company_refund", {
      p_payment_id: id, p_company_id: payment.company_id, p_actor_user_id: user.id,
      p_outcome: body.outcome, p_provider_reference: reference, p_evidence: evidence, p_paid_at: paidAt.toISOString(),
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : error.code === "55000" ? 409 : 503;
      return res.status(status).json({ error: status === 503 ? "Could not save reconciliation. Refresh before trying again." : error.message });
    }
    return res.status(200).json({ ok: true, ...data });
  } catch {
    return res.status(503).json({ error: "Refund reconciliation unavailable. Refresh before trying again." });
  }
}
export default withApiLogging(handler);
