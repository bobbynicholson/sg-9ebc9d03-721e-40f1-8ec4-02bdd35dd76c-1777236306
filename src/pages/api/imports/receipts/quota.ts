/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SHOP-B (shopping audit, 2026-05-24): exposes the per-tenant
 * monthly AI receipt scan quota to the UI. The Smart Shopping page
 * previously showed a misleading hardcoded "around ZAR 0.05 per
 * batch" line that was ~80x understated against current Anthropic
 * pricing. This endpoint replaces that with an honest
 * "X of 60 scans used this month" pill.
 *
 * Auth: tenant member only - resolves company_id from the SSR profile.
 * GET only. Cheap (two counts).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getReceiptScanQuota } from "@/lib/receiptScanQuota";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const { createPagesServerClient } = await import("@/lib/supabase/server");
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in required" });
    const { data: profile } = await ssr
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    const companyId = (profile as { company_id?: string } | null)?.company_id;
    if (!companyId) return res.status(403).json({ error: "No company on profile" });

    const sb = getServiceSupabase();
    const quota = await getReceiptScanQuota(sb, companyId);
    return res.status(200).json(quota);
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "quota lookup failed" });
  }
}
