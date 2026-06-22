/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET/POST /api/cron/event-approaching-reminder
 *
 * Proactive, forward-looking run-up reminders. Closes the gap that
 * order-sla-monitor only ESCALATES on event day once an order is
 * already behind, and only to admins - nothing told the kitchen /
 * driver ahead of time "this is the day, get going".
 *
 * Two layers, role-aware:
 *
 *   DAY BEFORE (event_date == tomorrow, order still active):
 *     - admin/owner: "Event tomorrow - make sure prep + logistics
 *       are lined up."
 *     - kitchen_staff: "Event tomorrow - start prep / shopping."
 *
 *   SAME DAY (event_date == today, order still active):
 *     - kitchen_staff: within KITCHEN_PREP_LEAD_H of the event and
 *       prep not started yet -> "Start prep now."
 *     - assigned driver: within DRIVER_LEAD_H of pickup/event and
 *       not picked up yet -> "Get ready to load and leave for <venue>."
 *
 * Each reminder fires once (distinct notification types + dedup), and
 * comms-paused orders are skipped. This complements (does not duplicate)
 * order-sla-monitor: that one chases admins when behind; this one cues
 * the people who actually do the work, before the slip happens.
 *
 * Schedule: every 15 minutes (vercel.json) so the same-day lead-time
 * windows are caught promptly. The day-before layer dedups to one ping.
 *
 * Auth: CRON_SECRET-gated via requireCronAuth (same as the siblings).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "event-approaching-reminder";

// Notification types (distinct per layer/role so dedup fires each once).
const TYPE_TOMORROW_ADMIN = "event_tomorrow_admin";
const TYPE_TOMORROW_KITCHEN = "event_tomorrow_kitchen";
const TYPE_DAY_KITCHEN = "event_day_kitchen_start";
const TYPE_DAY_DRIVER = "event_day_driver_ready";

// Lead-time windows (hours before the event start) for the same-day cues.
const KITCHEN_PREP_LEAD_H = 6; // start prep ~6h out if not begun
const DRIVER_LEAD_H = 3;       // driver get-ready ~3h before pickup/event

// Active = not terminal, not paused. Mirrors order-sla-monitor.
const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready", "in_transit"];

// Dedup windows. A day's worth so each cue lands once even though the
// cron ticks every 15 min.
const DEDUP_MIN = 18 * 60;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const tomorrowIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: orders, error } = await sb
    .from("orders")
    .select(
      "id, company_id, region_id, order_number, status, event_date, event_time, " +
        "delivery_time, pickup_time, setup_time, prep_started_at, picked_up_at, " +
        "assigned_driver_id, comms_paused_until, venue_name, venue_address, event_name",
    )
    .in("event_date", [todayIso, tomorrowIso])
    .in("status", ACTIVE_STATUSES)
    .is("deleted_at", null)
    .limit(1000);

  if (error) {
    console.error("[cron/event-approaching-reminder] read failed:", error);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
    return res.status(500).json({ error: error.message });
  }

  const { notificationService } = await import("@/services/notificationService");

  let tomorrowPings = 0;
  let kitchenPings = 0;
  let driverPings = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const o of (orders || []) as any[]) {
    try {
      // Respect an explicit comms pause window.
      if (o.comms_paused_until && new Date(o.comms_paused_until).getTime() > now.getTime()) {
        skipped += 1;
        continue;
      }

      const orderLabel = o.order_number || String(o.id).slice(0, 8);
      const venue = o.venue_name || (o.venue_address ? String(o.venue_address).split(",")[0] : "");
      const eventName = o.event_name && o.event_name !== "Untitled" ? o.event_name : "the event";
      const link = `/admin/orders?orderId=${o.id}`;

      // ---------- DAY BEFORE ----------
      if (o.event_date === tomorrowIso) {
        const adminSent = await notificationService.broadcastNotification(
          {
            companyId: o.company_id,
            regionId: o.region_id || null,
            targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
            title: `🗓️ Event tomorrow: ${orderLabel}`,
            message: `${eventName}${venue ? ` at ${venue}` : ""} is tomorrow. Make sure prep, equipment and the driver run are lined up.`,
            type: TYPE_TOMORROW_ADMIN,
            priority: "normal",
            link,
            relatedEntityType: "order",
            relatedEntityId: o.id,
            dedup: true,
            dedupWindowMinutes: DEDUP_MIN,
          },
          sb,
        );
        const kitchenSent = await notificationService.broadcastNotification(
          {
            companyId: o.company_id,
            regionId: o.region_id || null,
            targetRoles: ["kitchen_staff" as any],
            title: `👩‍🍳 Prep for tomorrow: ${orderLabel}`,
            message: `${eventName} is tomorrow. Get the shopping + prep started so it's ready in time.`,
            type: TYPE_TOMORROW_KITCHEN,
            priority: "normal",
            link: "/team-portal/kitchen/dashboard",
            relatedEntityType: "order",
            relatedEntityId: o.id,
            dedup: true,
            dedupWindowMinutes: DEDUP_MIN,
          },
          sb,
        );
        if ((adminSent || 0) > 0 || (kitchenSent || 0) > 0) tomorrowPings += 1;
        else skipped += 1;
        continue;
      }

      // ---------- SAME DAY ----------
      // Effective event start (mirror order-sla-monitor's fallbacks).
      const timeStr = o.event_time || o.delivery_time || o.pickup_time || o.setup_time || "12:00:00";
      const eventStart = new Date(`${o.event_date}T${timeStr}`);
      if (Number.isNaN(eventStart.getTime())) { skipped += 1; continue; }
      const minsUntilEvent = (eventStart.getTime() - now.getTime()) / 60000;

      // Kitchen: start prep now (within lead, prep not begun).
      const prepBegun = !!o.prep_started_at || ["preparing", "ready", "in_transit", "delivered", "completed"].includes(String(o.status));
      if (!prepBegun && minsUntilEvent <= KITCHEN_PREP_LEAD_H * 60 && minsUntilEvent > -120) {
        const sent = await notificationService.broadcastNotification(
          {
            companyId: o.company_id,
            regionId: o.region_id || null,
            targetRoles: ["kitchen_staff" as any],
            title: `🔥 Start prep now: ${orderLabel}`,
            message: `${eventName}${venue ? ` at ${venue}` : ""} is today (in ${Math.max(0, Math.round(minsUntilEvent / 60))}h). Prep hasn't started - get it going now.`,
            type: TYPE_DAY_KITCHEN,
            priority: "high",
            link: "/team-portal/kitchen/dashboard",
            relatedEntityType: "order",
            relatedEntityId: o.id,
            dedup: true,
            dedupWindowMinutes: DEDUP_MIN,
          },
          sb,
        );
        if ((sent || 0) > 0) kitchenPings += 1;
      }

      // Driver: get ready to load + leave (within lead of pickup/event,
      // not yet picked up). Pickup time preferred; fall back to event.
      const pickupStr = o.pickup_time || timeStr;
      const pickupStart = new Date(`${o.event_date}T${pickupStr}`);
      const minsUntilPickup = Number.isNaN(pickupStart.getTime())
        ? minsUntilEvent
        : (pickupStart.getTime() - now.getTime()) / 60000;
      const pickedUp = !!o.picked_up_at || ["in_transit", "delivered", "completed"].includes(String(o.status));
      if (o.assigned_driver_id && !pickedUp && minsUntilPickup <= DRIVER_LEAD_H * 60 && minsUntilPickup > -120) {
        const created = await notificationService.createNotification(
          {
            company_id: o.company_id,
            recipient_id: o.assigned_driver_id,
            user_id: o.assigned_driver_id,
            notification_type: TYPE_DAY_DRIVER,
            title: `🚚 Get ready to roll: ${orderLabel}`,
            message: `${eventName}${venue ? ` at ${venue}` : ""} - pickup in ${Math.max(0, Math.round(minsUntilPickup / 60))}h. Load up and head out so you arrive on time.`,
            priority: "high",
            link: "/team-portal/driver/dashboard",
            related_entity_type: "order",
            related_entity_id: o.id,
            dedup: true,
            dedupWindowMinutes: DEDUP_MIN,
          } as any,
          sb,
        );
        if (created) driverPings += 1;
      }
    } catch (e: any) {
      errors.push(`${o.id}: ${e?.message || String(e)}`);
    }
  }

  if (errors.length > 0) console.warn("[cron/event-approaching-reminder] per-row errors:", errors);

  await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
    source: auth.source,
    checked: (orders || []).length,
    tomorrowPings,
    kitchenPings,
    driverPings,
    skipped,
    errors_count: errors.length,
  });

  return res.status(200).json({
    ok: true,
    checked: (orders || []).length,
    tomorrowPings,
    kitchenPings,
    driverPings,
    skipped,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}

export default withApiLogging(handler);
