/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/admin/money-reconciliation
 *
 * Scans the caller's company for order/invoice/payment money drift and
 * returns the list of issues. Admin / owner only. Read-only - surfaces
 * problems, never mutates. Backs the admin Money Health panel + is reused
 * by the nightly reconciliation cron.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { findMoneyInconsistencies } from "@/services/order/moneyReconciliation";
import { withApiLogging } from "@/lib/withApiLogging";

const ALLOWED = new Set(["super_admin", "company_admin", "admin", "owner", "region_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED.has(role)) return res.status(403).json({ error: "Admin / owner only" });
    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const service = getServiceSupabase();
    const result = await findMoneyInconsistencies(service as any, companyId, { limit: 500 });
    return res.status(200).json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[money-reconciliation] crashed:", e);
    return res.status(500).json({ error: e?.message || "Reconciliation failed" });
  }
}

export default withApiLogging(handler);
