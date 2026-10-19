import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner", "sales_admin", "region_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const paymentId = typeof req.query.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return res.status(400).json({ error: "Valid payment id required" });
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) return res.status(400).json({ error: "A reversal reason is required" });
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const { data: profile, error: profileError } = await ssr.from("profiles").select("company_id, role, active_role").eq("id", user.id).maybeSingle();
    if (profileError) return res.status(503).json({ error: "Could not verify your permission" });
    const role = profile?.active_role || profile?.role || "";
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin permission required" });
    if (!profile?.company_id) return res.status(400).json({ error: "No company on profile" });
    const { data, error } = await getServiceSupabase().rpc("void_manual_invoice_payment", {
      p_payment_id: paymentId, p_company_id: profile.company_id, p_actor_user_id: user.id, p_reason: reason,
    });
    if (error) return res.status(409).json({ error: dbErrorMessage(error) });
    return res.status(200).json({ ok: true, ...(data || {}) });
  } catch (error) {
    return res.status(500).json({ error: dbErrorMessage(error) || "Could not reverse payment" });
  }
}
export default withApiLogging(handler);
