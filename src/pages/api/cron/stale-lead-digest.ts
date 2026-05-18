/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "stale-lead-digest";

/**
 * Wave 50 C2 - weekly stale-lead digest.
 *
 * Audit (Specialist 4) found leads sat at status='new' indefinitely
 * with no nurture, no nudge, no digest. Operators only saw the
 * staleness when they happened to scroll the leads list.
 *
 * Strategy: every Monday morning, walk every active tenant and
 * count leads at status IN ('new','contacted') older than 7 days.
 * Email + in-app push the operator (owner / company_admin) with
 * the count + a deeplink to the filtered leads page.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await sb
      .from("leads")
      .select("company_id")
      .in("status", ["new", "contacted"])
      .lte("created_at", sevenDaysAgo);
    if (error) {
      console.error("[stale-lead-digest] leads fetch failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }

    const countsByTenant: Record<string, number> = {};
    for (const r of (rows || []) as Array<{ company_id: string }>) {
      countsByTenant[r.company_id] = (countsByTenant[r.company_id] || 0) + 1;
    }

    const { notificationService } = await import("@/services/notificationService");
    let tenantsNotified = 0;

    for (const [companyId, count] of Object.entries(countsByTenant)) {
      if (count <= 0) continue;
      try {
        await notificationService.broadcastNotification({
          companyId,
          type: "stale_lead_digest",
          title: `${count} lead${count === 1 ? "" : "s"} need a follow-up`,
          message: `${count} lead${count === 1 ? " has" : "s have"} been sitting at 'new' or 'contacted' for over a week. Tap to triage.`,
          targetRoles: ["owner" as any, "company_admin" as any, "admin" as any, "sales_admin" as any],
          priority: "normal",
          link: `/admin/leads?status=new`,
          dedup: true,
          dedupWindowMinutes: 60 * 24,
        });
        tenantsNotified += 1;
      } catch (e) {
        console.warn(`[stale-lead-digest] broadcast failed for ${companyId}:`, e);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", {
      source: auth.source,
      tenantsScanned: Object.keys(countsByTenant).length,
      tenantsNotified,
      totalStaleLeads: Object.values(countsByTenant).reduce((s, n) => s + n, 0),
    });
    return res.status(200).json({
      ok: true,
      tenantsScanned: Object.keys(countsByTenant).length,
      tenantsNotified,
      totalStaleLeads: Object.values(countsByTenant).reduce((s, n) => s + n, 0),
    });
  } catch (e: any) {
    console.error("[stale-lead-digest] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
