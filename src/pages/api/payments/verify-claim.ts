/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
const ADMIN_ROLES = new Set(["owner", "company_admin", "admin", "sales_admin", "region_admin", "super_admin"]);
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { data: { user } } = await createPagesServerClient({ req, res }).auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in first" });
    const { payment_id, action, reason } = req.body || {};
    if (typeof payment_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payment_id) ||
        !["confirm", "reject"].includes(action)) return res.status(400).json({ error: "Invalid payment or action" });
    const admin: any = getServiceSupabase();
    const { data: profile, error: profileError } = await admin.from("profiles").select("role, company_id").eq("id", user.id).maybeSingle();
    if (profileError) return res.status(503).json({ error: "Could not verify permission" });
    if (!profile || !ADMIN_ROLES.has(profile.role)) return res.status(403).json({ error: "Admin only" });
    const { data: payment, error: paymentError } = await admin.from("payments").select("company_id").eq("id", payment_id).maybeSingle();
    if (paymentError) return res.status(503).json({ error: "Could not load payment" });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (profile.role !== "super_admin" && profile.company_id !== payment.company_id) return res.status(403).json({ error: "Wrong company" });
    const { data, error } = await admin.rpc("verify_eft_payment_claim", {
      p_payment_id: payment_id, p_company_id: payment.company_id, p_action: action,
      p_reason: typeof reason === "string" ? reason.trim().slice(0, 500) : null,
    });
    if (error) return res.status(error.code === "23505" ? 409 : error.code === "22023" ? 400 : 503)
      .json({ error: error.code === "23505" ? "This claim was already resolved by another action" : "Could not verify this EFT claim" });
    // Notifications/receipts are queued in the same transaction, and retried
    // by reconcile-payment-events. Repeated confirmation does not add money.
    return res.status(200).json({ ok: true, ...data });
  } catch (error) {
    console.error("verify-claim failed", error);
    return res.status(503).json({ error: "Could not commit EFT verification. Please retry." });
  }
}
export default withApiLogging(handler);
