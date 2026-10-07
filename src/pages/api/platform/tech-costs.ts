/**
 * GET /api/platform/tech-costs
 *
 * Super_admin-only live data for /admin/platform/tech-costs: real company
 * and revenue numbers, last-30-day usage, the stored USD/ZAR rate, vendor
 * costs from src/lib/techCosts/model.ts, and this month's AI spend from
 * ai_usage_events. The page polls it, so AI calls show up as they happen.
 * Read-only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { getLiveTechCostData } from "@/services/platformTechnologyCostService";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });

  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role")
    .eq("id", user.id)
    .maybeSingle();
  // Same rule as the other platform endpoints: super_admin on either column.
  const roles = [profile?.role, profile?.active_role].map((r) => String(r || ""));
  if (!roles.includes("super_admin")) return res.status(403).json({ error: "Super admin only" });

  const data = await getLiveTechCostData(getServiceSupabase());
  if (!data) return res.status(503).json({ error: "Could not load platform records right now. Try again shortly." });
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(data);
}

export default withApiLogging(handler);
