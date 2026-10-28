/**
 * GET /api/admin/client-credits[?clientId=uuid]
 *
 * Store credit clients hold with the caller's company (overpayments kept
 * as credit, cancellation credit), so the team sees it on Contacts, on
 * quotes and when sending a payment request.
 *
 * Reply: { ok, credits: { [clientId]: availableAmount } } - only clients
 * with credit are listed; with ?clientId only that client (if any).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { getClientCreditBalance, getCompanyClientCredits } from "@/services/cancellation/clientCreditBalance";

const STAFF_ROLES = new Set(["super_admin", "company_admin", "admin", "owner", "sales_admin", "region_admin"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });
  const { data: profile } = await ssr.from("profiles").select("role, active_role, company_id").eq("id", user.id).maybeSingle();
  const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
  const companyId = (profile as any)?.company_id as string | undefined;
  if (!STAFF_ROLES.has(role) || !companyId) return res.status(403).json({ error: "Admin only" });

  const admin: any = getServiceSupabase();
  const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
  if (clientId) {
    if (!UUID.test(clientId)) return res.status(400).json({ error: "Invalid client" });
    const balance = await getClientCreditBalance(admin, { companyId, clientId });
    return res.status(200).json({ ok: true, credits: balance.available > 0 ? { [clientId]: balance.available } : {} });
  }
  return res.status(200).json({ ok: true, credits: await getCompanyClientCredits(admin, companyId) });
}

export default withApiLogging(handler);
