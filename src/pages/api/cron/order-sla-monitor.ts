/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET/POST /api/cron/order-sla-monitor
 *
 * Cron: escalate orders that are falling behind their operational SLA
 * on EVENT DAY - i.e. the event is imminent but the order has not
 * progressed to the lifecycle stage it should have reached by now.
 *
 * Why this exists (the gap it closes):
 *   - late-event-check only fires AFTER event_date < today - too late
 *     to recover; the food has already been late.
 *   - check-en-route only covers the driver leg (en-route confirmation).
 *   - order-stage-notify only reacts to FORWARD transitions; it says
 *     nothing when an order simply SITS in a stage too long.
 * Nothing escalated a kitchen / dispatch stall WHILE it was still
 * recoverable. This does.
 *
 * Model: for each active order whose event is today, compute minutes
 * until the event start, then compare the order's current stage rank
 * against the minimum stage it should have reached given that lead
 * time. If it's behind, broadcast an escalation to the company's
 * admins/owner with a severity that sharpens as the event approaches.
 *
 *   <= 4h out  -> must be at least PREPARING (prep_started_at)   [at risk]
 *   <= 2h out  -> must be at least READY     (ready_at)          [at risk]
 *   <= 1h out  -> must be at least IN_TRANSIT (picked_up_at)     [critical]
 *   past start -> still not in_transit                            [critical]
 *
 * Idempotency: broadcastNotification(dedup) keys on (type, order id).
 * at-risk and critical are distinct types, so an order escalating from
 * at-risk -> critical fires a fresh critical alert immediately, while
 * neither tier re-spams every tick.
 *
 * Respects pauses: status='paused' is excluded, and an order with
 * comms_paused_until in the future is skipped (reminders suspended).
 *
 * Timezone: mirrors driverConfirmationService.checkEnRouteConfirmation -
 * `new Date(`${event_date}T${event_time}`)` parsed in the runtime TZ -
 * so this cron and the en-route cron agree on "minutes until event".
 *
 * Auth: Vercel cron bearer OR super_admin session (requireCronAuth).
 * Vercel cron schedule: every 15 minutes (vercel.json).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "order-sla-monitor";

const TYPE_AT_RISK = "order_sla_at_risk";
const TYPE_CRITICAL = "order_sla_critical";

// Ordered lifecycle ranks. An order "behind" its expected rank for the
// time-to-event is what we escalate on.
const STAGE_RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  in_transit: 4,
  delivered: 5,
  completed: 6,
};

// Stages we still consider "in flight". Terminal + paused are excluded
// at the query level (paused reminders must stay silent).
const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready", "in_transit"];

// Lead-time SLA rules, evaluated most-urgent first. `requiredRank` is
// the minimum stage the order should have reached by `withinMin`
// minutes before the event. Tunable in one place.
const SLA_RULES: Array<{
  withinMin: number;
  requiredRank: number;
  severity: "critical" | "at_risk";
  reason: string;
}> = [
  { withinMin: 60, requiredRank: STAGE_RANK.in_transit, severity: "critical", reason: "not on the road" },
  { withinMin: 120, requiredRank: STAGE_RANK.ready, severity: "at_risk", reason: "not ready to dispatch" },
  { withinMin: 240, requiredRank: STAGE_RANK.preparing, severity: "at_risk", reason: "kitchen prep not started" },
];

// Don't chase events that finished long ago (stale / bad data); same-day
// past-start is still escalated (it's recoverable-ish and worse than late).
const PAST_FLOOR_MIN = -720; // 12h

// Dedup windows: critical repeats more often than at-risk, but neither
// every 15-min tick.
const DEDUP_MIN = { critical: 30, at_risk: 180 } as const;

function stageRank(status: string): number {
  return STAGE_RANK[status] ?? 0;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const { data: orders, error } = await sb
    .from("orders")
    .select(
      "id, company_id, region_id, user_id, order_number, status, event_date, event_time, " +
        "delivery_time, pickup_time, setup_time, comms_paused_until, venue_name, venue_address",
    )
    .eq("event_date", todayIso)
    .in("status", ACTIVE_STATUSES)
    .is("deleted_at", null)
    .limit(1000);

  if (error) {
    console.error("[cron/order-sla-monitor] read failed:", error);
    await recordCronHeartbeat(sb, CRON_NAME, "error", {
      source: auth.source,
      error_message: error.message,
    });
    return res.status(500).json({ error: error.message });
  }

  let scanned = 0;
  let atRisk = 0;
  let critical = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Lazy-load the notification service once (matches order-stage-notify).
  const { notificationService } = await import("@/services/notificationService");

  for (const o of (orders || []) as any[]) {
    try {
      // Respect an explicit comms pause window.
      if (o.comms_paused_until && new Date(o.comms_paused_until).getTime() > now.getTime()) {
        skipped += 1;
        continue;
      }

      // Effective event start: prefer event_time, then the operational
      // deadline fields, then a noon default so a timeless event is
      // still assessable rather than silently ignored.
      const timeStr = o.event_time || o.delivery_time || o.pickup_time || o.setup_time || "12:00:00";
      const eventStart = new Date(`${o.event_date}T${timeStr}`);
      if (Number.isNaN(eventStart.getTime())) {
        skipped += 1;
        continue;
      }

      const minsUntil = (eventStart.getTime() - now.getTime()) / 60000;
      if (minsUntil < PAST_FLOOR_MIN) {
        // Event finished long ago - leave to late-event-check / manual.
        skipped += 1;
        continue;
      }

      scanned += 1;
      const rank = stageRank(o.status);

      // First (most urgent) rule the order is both within-window for and
      // behind on wins.
      const breach = SLA_RULES.find((r) => minsUntil <= r.withinMin && rank < r.requiredRank);
      if (!breach) continue;

      const isCritical = breach.severity === "critical";
      const orderLabel = o.order_number || String(o.id).slice(0, 8);
      const venue = o.venue_name || (o.venue_address ? String(o.venue_address).split(",")[0] : "");
      const whenLabel =
        minsUntil < 0
          ? `event start was ${Math.abs(Math.round(minsUntil))} min ago`
          : `event in ${Math.round(minsUntil)} min`;

      const sent = await notificationService.broadcastNotification(
        {
          companyId: o.company_id,
          regionId: o.region_id || null,
          targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
          title: `${isCritical ? "🔴" : "🟠"} Order ${orderLabel} behind schedule`,
          message:
            `${orderLabel}${venue ? ` (${venue})` : ""} is "${o.status}" but ${breach.reason} - ` +
            `${whenLabel}. Check the kitchen/dispatch and push it forward now.`,
          type: isCritical ? TYPE_CRITICAL : TYPE_AT_RISK,
          priority: isCritical ? "urgent" : "high",
          link: `/admin/orders?orderId=${o.id}`,
          relatedEntityType: "order",
          relatedEntityId: o.id,
          dedup: true,
          dedupWindowMinutes: isCritical ? DEDUP_MIN.critical : DEDUP_MIN.at_risk,
        },
        sb,
      );

      // broadcastNotification returns 0 when deduped or tenant-muted; only
      // count a real escalation.
      if (typeof sent === "number" && sent > 0) {
        if (isCritical) critical += 1;
        else atRisk += 1;
      } else {
        skipped += 1;
      }
    } catch (e: any) {
      errors.push(`${o.id}: ${e?.message || String(e)}`);
    }
  }

  if (errors.length > 0) {
    console.warn("[cron/order-sla-monitor] per-row errors:", errors);
  }

  await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
    source: auth.source,
    checked: (orders || []).length,
    scanned,
    atRisk,
    critical,
    skipped,
    errors_count: errors.length,
  });

  return res.status(200).json({
    ok: true,
    checked: (orders || []).length,
    scanned,
    atRisk,
    critical,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export default withApiLogging(handler);
