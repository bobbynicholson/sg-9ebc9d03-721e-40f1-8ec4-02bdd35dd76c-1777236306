/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET/POST /api/cron/cleaning-overdue-check
 *
 * Chases post-event equipment cleaning that has run past its planned
 * finish but still isn't done. This is the last link in the order
 * close-out chain: delivered -> collected -> CLEANED -> closed. The
 * collection leg is chased by equipment-collection-reminder; without
 * this, cleaning that stalls left the order unable to close with nobody
 * nudged (the missed-clock-in cron only covers a shift not being
 * clocked into, not a job that drags on unfinished).
 *
 * A cleaning_job is overdue when planned_end is in the past and status
 * isn't complete/cancelled. We group the overdue jobs per order and
 * send ONE chase per order to the cleaning crew + company admins,
 * deduped daily so it keeps nudging until every job lands on complete.
 *
 * Auth: CRON_SECRET-gated via requireCronAuth (same as siblings).
 * Schedule: every 6 hours (vercel.json) - cleaning isn't minute-critical
 * and the 18h dedup collapses it to ~one chase per day per order.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "cleaning-overdue-check";
const TYPE_CLEANING_OVERDUE = "cleaning_overdue";
const DEDUP_MIN = 18 * 60;

// Don't chase a job that's only a little past plan - give the crew a
// grace window before it counts as "overdue" (matches the 6h grace the
// collection overdue phase uses).
const GRACE_MIN = 6 * 60;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const now = new Date();
  const cutoffIso = new Date(now.getTime() - GRACE_MIN * 60 * 1000).toISOString();

  // Overdue = planned_end older than the grace cutoff, not finished, not
  // cancelled, not deleted. Only order-linked jobs (the close-out chain).
  const { data: jobs, error } = await sb
    .from("cleaning_jobs")
    .select("id, company_id, equipment_id, status, planned_end, triggered_by_event_id")
    .lt("planned_end", cutoffIso)
    .not("status", "in", "(complete,cancelled)")
    .not("triggered_by_event_id", "is", null)
    .is("deleted_at", null)
    .limit(2000);

  if (error) {
    console.error("[cron/cleaning-overdue-check] read failed:", error);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
    return res.status(500).json({ error: error.message });
  }
  if (!jobs || jobs.length === 0) {
    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, overdueJobs: 0, ordersChased: 0 });
    return res.status(200).json({ ok: true, overdueJobs: 0, ordersChased: 0 });
  }

  // Group overdue jobs by order.
  const byOrder = new Map<string, { count: number; oldest: string; companyId: string }>();
  for (const j of jobs as any[]) {
    const k = j.triggered_by_event_id as string;
    const e = byOrder.get(k) || { count: 0, oldest: j.planned_end, companyId: j.company_id };
    e.count += 1;
    if (j.planned_end && j.planned_end < e.oldest) e.oldest = j.planned_end;
    byOrder.set(k, e);
  }

  // Batch-fetch the orders for labels + region.
  const orderIds = Array.from(byOrder.keys());
  const orderById = new Map<string, any>();
  const { data: orderRows } = await sb
    .from("orders")
    .select("id, company_id, region_id, order_number, event_name, venue_name, venue_address, status")
    .in("id", orderIds)
    .is("deleted_at", null);
  for (const o of (orderRows || []) as any[]) orderById.set(o.id, o);

  const { notificationService } = await import("@/services/notificationService");

  let ordersChased = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [orderId, agg] of byOrder.entries()) {
    try {
      const o = orderById.get(orderId);
      // Order gone / soft-deleted / already closed -> nothing to chase.
      if (!o || o.status === "completed" || o.status === "cancelled") {
        skipped += 1;
        continue;
      }
      const orderLabel = o.order_number || String(orderId).slice(0, 8);
      const venue = o.venue_name || (o.venue_address ? String(o.venue_address).split(",")[0] : "");
      const eventName = o.event_name && o.event_name !== "Untitled" ? o.event_name : "the event";
      const dueLabel = new Date(agg.oldest).toLocaleString("en-ZA", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
      const itemLabel = agg.count === 1 ? "1 item" : `${agg.count} items`;

      const sent = await notificationService.broadcastNotification(
        {
          companyId: o.company_id || agg.companyId,
          regionId: o.region_id || null,
          targetRoles: ["cleaning_staff" as any, "company_admin" as any, "admin" as any, "owner" as any],
          title: `⚠️ Cleaning overdue: ${orderLabel}`,
          message: `${itemLabel} from ${eventName}${venue ? ` (${venue})` : ""} ${agg.count === 1 ? "was" : "were"} due to be cleaned by ${dueLabel} and ${agg.count === 1 ? "isn't" : "aren't"} done. The order can't close until the gear's back in stock.`,
          type: TYPE_CLEANING_OVERDUE,
          priority: "high",
          link: "/team-portal/cleaning",
          relatedEntityType: "order",
          relatedEntityId: orderId,
          dedup: true,
          dedupWindowMinutes: DEDUP_MIN,
        },
        sb,
      );
      if ((sent || 0) > 0) ordersChased += 1;
      else skipped += 1;
    } catch (e: any) {
      errors.push(`${orderId}: ${e?.message || String(e)}`);
    }
  }

  if (errors.length > 0) console.warn("[cron/cleaning-overdue-check] per-order errors:", errors);

  await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
    source: auth.source,
    overdueJobs: jobs.length,
    ordersChased,
    skipped,
    errors_count: errors.length,
  });
  return res.status(200).json({
    ok: true,
    overdueJobs: jobs.length,
    ordersChased,
    skipped,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}

export default withApiLogging(handler);
