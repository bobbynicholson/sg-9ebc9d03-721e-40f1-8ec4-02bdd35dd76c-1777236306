/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "batch-expiry-alert";

// How far ahead to warn. The admin InventoryExpiryWidget surfaces a 14-day
// horizon read-only; this proactive ping fires only for the urgent band so
// it isn't noise - stock that needs using/binning within 3 days (or is
// already overdue).
const WINDOW_DAYS = 3;

/**
 * Notification-audit gap #13: proactive batch-expiry alert.
 *
 * inventory_batches carries a per-batch expiry_date, and the admin
 * InventoryExpiryWidget shows what's expiring - but it's read-only, so an
 * admin only ever sees it if they happen to open the inventory page. Stock
 * could spoil unseen. This daily cron sweeps every tenant for batches with
 * stock remaining (quantity > 0) whose expiry_date is within the next
 * WINDOW_DAYS (or already past) and pings owners/admins with a summary so
 * they can use or write off the stock before it's a loss - directly
 * relevant to the food-cost % / margin KPIs.
 *
 * One summary notification per tenant (not per batch) to avoid a flood when
 * a delivery lands many short-dated batches. Dedup'd on a ~20h window so a
 * re-run (or the manual super-admin trigger) doesn't double-ping, but each
 * day's run still produces a fresh reminder as the date nears.
 *
 * Idempotent + read-only against inventory (writes only notifications +
 * heartbeat). Supports ?dryRun=1 to preview without notifying.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const sb: any = getServiceSupabase();

  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const horizonIso = new Date(Date.now() + WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    // Batches with stock left, a real expiry date inside the window (or
    // overdue), not soft-deleted, and still active (skip already-expired /
    // depleted rows the operator has dealt with).
    const { data: batches, error: selErr } = await sb
      .from("inventory_batches")
      .select("id, company_id, inventory_item_id, batch_number, quantity, expiry_date")
      .is("deleted_at", null)
      .eq("status", "active")
      .not("expiry_date", "is", null)
      .gt("quantity", 0)
      .lte("expiry_date", horizonIso)
      .order("expiry_date", { ascending: true })
      .limit(5000);

    if (selErr) {
      console.error("[batch-expiry-alert] select failed:", selErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: selErr.message });
      return res.status(500).json({ error: selErr.message });
    }

    // Group by tenant so each company gets a single summary ping.
    const byCompany = new Map<string, { soon: number; overdue: number; soonest: string | null }>();
    for (const b of (batches as any[]) || []) {
      const companyId = b.company_id;
      if (!companyId) continue;
      const agg = byCompany.get(companyId) || { soon: 0, overdue: 0, soonest: null };
      if (b.expiry_date && b.expiry_date < todayIso) agg.overdue += 1;
      else agg.soon += 1;
      if (!agg.soonest || (b.expiry_date && b.expiry_date < agg.soonest)) {
        agg.soonest = b.expiry_date;
      }
      byCompany.set(companyId, agg);
    }

    const companyCount = byCompany.size;
    const batchCount = ((batches as any[]) || []).length;

    if (companyCount === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, companies: 0, batches: 0 });
      return res.status(200).json({ ok: true, companies: 0, batches: 0 });
    }

    if (dryRun) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, dryRun: true, companies: companyCount, batches: batchCount });
      return res.status(200).json({
        ok: true,
        dryRun: true,
        companies: companyCount,
        batches: batchCount,
        breakdown: Array.from(byCompany.entries()).map(([companyId, a]) => ({ companyId, ...a })),
      });
    }

    // Per-tenant summary ping to owners/admins. Best-effort; a notify
    // failure for one tenant must never fail the cron. Service-role client
    // so RLS doesn't block these cross-tenant inserts.
    let notified = 0;
    try {
      const { notificationService } = await import("@/services/notificationService");
      for (const [companyId, agg] of byCompany.entries()) {
        const total = agg.soon + agg.overdue;
        const overduePart = agg.overdue > 0 ? `${agg.overdue} already overdue` : "";
        const soonPart = agg.soon > 0 ? `${agg.soon} expiring within ${WINDOW_DAYS} days` : "";
        const detail = [overduePart, soonPart].filter(Boolean).join(", ");
        try {
          await notificationService.broadcastNotification({
            companyId,
            type: "batch_expiring",
            title: `⚠️ ${total} stock batch${total === 1 ? "" : "es"} need attention`,
            message: `${detail || `${total} batches`}. Use or write off this stock before it's a loss - open Inventory to review.`,
            targetRoles: ["owner", "company_admin", "admin"] as any,
            priority: agg.overdue > 0 ? "high" : "normal",
            link: "/admin/inventory",
            relatedEntityType: "company",
            relatedEntityId: companyId,
            dedup: true,
            // ~20h window: one ping per tenant per daily run, no double-fire
            // on a re-run or manual trigger.
            dedupWindowMinutes: 1200,
          }, sb);
          notified += 1;
        } catch (perCoErr) {
          console.warn("[batch-expiry-alert] notify failed for company", companyId, perCoErr);
        }
      }
    } catch (notifyErr) {
      console.warn("[batch-expiry-alert] notification cascade crashed (non-blocking):", notifyErr);
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, companies: companyCount, batches: batchCount, notified });
    return res.status(200).json({ ok: true, companies: companyCount, batches: batchCount, notified });
  } catch (e: any) {
    console.error("[batch-expiry-alert] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
