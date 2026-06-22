/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/cron/money-reconciliation-check
 *
 * Nightly money-drift sweep. For each company, scans orders for order/invoice/
 * payment disagreement and, when any are found, pings the company's admins so
 * they fix it before a client notices. Read-only - it never mutates money,
 * only surfaces. Heartbeat records the platform-wide issue count for trend.
 *
 * Auth: Vercel cron bearer OR super_admin (shared requireCronAuth policy).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { findMoneyInconsistencies } from "@/services/order/moneyReconciliation";
import { notificationService } from "@/services/notificationService";
import { UserRole } from "@/types/app";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "money-reconciliation-check";
const ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.REGION_ADMIN];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const supabase: any = getServiceSupabase();
  let companiesScanned = 0;
  let totalIssues = 0;
  let companiesFlagged = 0;

  try {
    const { data: companies, error } = await supabase
      .from("companies")
      .select("id, company_name")
      .is("deleted_at", null);
    if (error) {
      await recordCronHeartbeat(supabase, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }

    for (const c of (companies || []) as any[]) {
      companiesScanned += 1;
      let result;
      try {
        result = await findMoneyInconsistencies(supabase, c.id, { limit: 500 });
      } catch (e: any) {
        console.warn("[money-reconciliation-check] scan failed for", c.id, e?.message);
        continue;
      }
      if (result.affectedOrders === 0) continue;
      totalIssues += result.issues.length;
      companiesFlagged += 1;

      // Ping the company's admins (dedup so a nightly re-run doesn't spam).
      try {
        const errorCount = result.issues.filter((i) => i.severity === "error").length;
        await notificationService.broadcastNotification({
          companyId: c.id,
          type: "system_alert",
          title: "Money check: figures don't reconcile",
          message: `${result.affectedOrders} order${result.affectedOrders === 1 ? "" : "s"} have order/invoice/payment figures that disagree${errorCount ? ` (${errorCount} need attention)` : ""}. Review the money health panel.`,
          targetRoles: ADMIN_ROLES,
          priority: errorCount > 0 ? "high" : "normal",
          link: "/admin/money-health",
          relatedEntityType: "company",
          relatedEntityId: c.id,
          dedup: true,
          dedupWindowMinutes: 1440,
        } as any);
      } catch (notifyErr) {
        console.warn("[money-reconciliation-check] notify failed for", c.id, notifyErr);
      }
    }

    await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
      source: auth.source, companiesScanned, companiesFlagged, totalIssues,
    });
    return res.status(200).json({ ok: true, companiesScanned, companiesFlagged, totalIssues });
  } catch (e: any) {
    console.error("[money-reconciliation-check] crashed:", e);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", { source: auth.source, error_message: e?.message });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
