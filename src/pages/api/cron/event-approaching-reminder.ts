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
const TYPE_SHOPPING_LEAD = "event_shopping_lead";
const TYPE_TOMORROW_ADMIN = "event_tomorrow_admin";
const TYPE_TOMORROW_KITCHEN = "event_tomorrow_kitchen";
const TYPE_DAY_KITCHEN = "event_day_kitchen_start";
const TYPE_DAY_DRIVER = "event_day_driver_ready";

// Different tasks need different lead times - that's the whole point:
//   SHOPPING needs the longest runway. Buying stock means a market /
//     supplier trip that can't be done last-minute, so we start nudging
//     SHOPPING_LEAD_DAYS out and repeat daily until the list is bought.
//   PREP is day-before ("prep tomorrow") + same-day ("start prep now").
//   DRIVER is same-day only ("get ready to roll").
const SHOPPING_LEAD_DAYS = 3;  // begin shopping nudges 3 days out
const KITCHEN_PREP_LEAD_H = 6; // start prep ~6h out if not begun
const DRIVER_LEAD_H = 3;       // driver get-ready ~3h before pickup/event

// Active = not terminal, not paused. Mirrors order-sla-monitor.
const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready", "in_transit"];

// Dedup windows. A day's worth so each cue lands once per day even though
// the cron ticks every 15 min (shopping then repeats the next day until done).
const DEDUP_MIN = 18 * 60;

// Queue branded reminder EMAILS to staff (admin / kitchen) alongside the
// in-app ping, so a role that isn't staring at the bell still hears about
// tomorrow's event. Company + role scoped, deduped per order+type over the
// same window as the in-app dedup so the 15-min tick never re-sends. Rows
// go in as status='queued' scheduled now; process-email-queue drains them
// and emailService auto-wraps the plain body in the tenant's branded shell
// (so we pass plain text here, no HTML). Best-effort: a queue failure must
// never break the in-app path, so callers ignore the return on error.
async function queueStaffReminderEmails(
  sb: any,
  companyId: string,
  orderId: string,
  roles: string[],
  triggerEvent: string,
  subject: string,
  body: string,
  excludeActiveRoles: string[] = [],
): Promise<number> {
  try {
    const { data: profs } = await sb
      .from("profiles")
      .select("email, full_name, role, active_role")
      .eq("company_id", companyId)
      .in("role", roles)
      .not("email", "is", null);
    if (!profs || profs.length === 0) return 0;
    // Drop staff whose active_role is excluded (e.g. waiters under base
    // role kitchen_staff must not get the kitchen prep email).
    const excludeActive = new Set(excludeActiveRoles.map((r) => String(r)));
    const eligible = excludeActive.size > 0
      ? (profs as any[]).filter((p) => !excludeActive.has(String(p.active_role || "")))
      : (profs as any[]);
    if (eligible.length === 0) return 0;

    // Dedup: skip anyone already queued/sent this exact reminder for this
    // order inside the dedup window (mirrors the in-app dedup).
    const since = new Date(Date.now() - DEDUP_MIN * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from("outgoing_email_queue")
      .select("to_email")
      .eq("trigger_ref_id", orderId)
      .eq("trigger_event", triggerEvent)
      .gte("created_at", since);
    const already = new Set(
      (existing || []).map((r: any) => String(r.to_email || "").toLowerCase()),
    );

    const rows: any[] = [];
    const seen = new Set<string>();
    for (const p of eligible) {
      const em = String(p.email || "").toLowerCase();
      if (!em || already.has(em) || seen.has(em)) continue;
      seen.add(em);
      rows.push({
        company_id: companyId,
        to_email: p.email,
        to_name: p.full_name || null,
        subject,
        body,
        trigger_event: triggerEvent,
        trigger_ref_id: orderId,
        status: "queued",
        scheduled_for: new Date().toISOString(),
        template_type: triggerEvent,
      });
    }
    if (rows.length === 0) return 0;
    const { error } = await sb.from("outgoing_email_queue").insert(rows);
    if (error) {
      console.warn("[cron/event-approaching-reminder] email queue insert failed:", error.message);
      return 0;
    }
    return rows.length;
  } catch (e: any) {
    console.warn("[cron/event-approaching-reminder] email queue crashed (non-blocking):", e?.message || String(e));
    return 0;
  }
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
  // Horizon covers the longest lead (shopping). Same-day + day-before
  // layers just look at how many days out each order actually is.
  const horizonIso = new Date(now.getTime() + SHOPPING_LEAD_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: orders, error } = await sb
    .from("orders")
    .select(
      "id, company_id, region_id, order_number, status, event_date, event_time, " +
        "delivery_time, pickup_time, setup_time, prep_started_at, picked_up_at, " +
        "assigned_driver_id, comms_paused_until, venue_name, venue_address, event_name",
    )
    .gte("event_date", todayIso)
    .lte("event_date", horizonIso)
    .in("status", ACTIVE_STATUSES)
    .is("deleted_at", null)
    .limit(1000);

  if (error) {
    console.error("[cron/event-approaching-reminder] read failed:", error);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
    return res.status(500).json({ error: error.message });
  }

  const { notificationService } = await import("@/services/notificationService");

  // Shopping completeness per order so we never nag the kitchen about
  // shopping that's already done (or that doesn't exist for this order).
  // "Manually handled" shows up here too: whoever ticked the items off
  // (or whoever stamped prep_started_at) flips the order out of the
  // pending state, so the reminder self-suppresses.
  const orderIds = (orders || []).map((o: any) => o.id);
  const shoppingByOrder = new Map<string, { total: number; purchased: number }>();
  if (orderIds.length > 0) {
    const { data: slRows, error: slErr } = await sb
      .from("shopping_list_items")
      .select("source_order_id, purchased")
      .in("source_order_id", orderIds)
      .is("removed_at", null);
    if (slErr) console.warn("[cron/event-approaching-reminder] shopping fetch failed:", slErr.message);
    for (const r of (slRows || []) as any[]) {
      const k = r.source_order_id;
      if (!k) continue;
      const e = shoppingByOrder.get(k) || { total: 0, purchased: 0 };
      e.total += 1;
      if (r.purchased === true) e.purchased += 1;
      shoppingByOrder.set(k, e);
    }
  }

  let shoppingPings = 0;
  let tomorrowPings = 0;
  let kitchenPings = 0;
  let driverPings = 0;
  let emailPings = 0;
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

      // Has the kitchen already handled (or manually started) its work?
      // prep_started_at OR a status past confirmed = prep underway/done.
      const prepBegun = !!o.prep_started_at
        || ["preparing", "ready", "in_transit", "delivered", "completed"].includes(String(o.status));
      // Shopping: pending only when a list exists and isn't fully bought.
      const shop = shoppingByOrder.get(o.id) || { total: 0, purchased: 0 };
      const shoppingPending = shop.total > 0 && shop.purchased < shop.total;

      // Whole calendar days until the event - both parsed as UTC midnight
      // so this is an exact integer, not a clock-time delta.
      const daysUntil = Math.round(
        (new Date(`${o.event_date}T00:00:00Z`).getTime() - new Date(`${todayIso}T00:00:00Z`).getTime())
        / 86_400_000,
      );

      // ---------- SHOPPING LEAD (longest runway) ----------
      // Procurement can't be last-minute, so nudge from SHOPPING_LEAD_DAYS
      // out and repeat daily (18h dedup) until the list is bought. Skips
      // entirely when there's no list, or it's already done / manually
      // ticked off. Targets the shopping crew, falling through to kitchen
      // for tenants without a dedicated shopper.
      if (shoppingPending && daysUntil >= 0 && daysUntil <= SHOPPING_LEAD_DAYS) {
        const dayLabel = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;
        const shopMsg = `${eventName}${venue ? ` at ${venue}` : ""} is ${dayLabel} and shopping isn't done (${shop.purchased}/${shop.total} bought). Get to the market so stock's in before prep.`;
        const sent = await notificationService.broadcastNotification(
          {
            companyId: o.company_id,
            regionId: o.region_id || null,
            // Raj 2026-07-05: admin needs the shopping nudge too, not just
            // the shopping/kitchen crew - so an owner can chase it.
            targetRoles: ["company_admin" as any, "admin" as any, "owner" as any, "shopping_staff" as any, "kitchen_manager" as any, "kitchen_staff" as any],
            title: `🛒 Shop for ${orderLabel}`,
            message: shopMsg,
            type: TYPE_SHOPPING_LEAD,
            priority: daysUntil <= 1 ? "high" : "normal",
            link: o.event_date ? `/admin/shopping?date=${o.event_date}` : "/admin/shopping",
            relatedEntityType: "order",
            relatedEntityId: o.id,
            dedup: true,
            dedupWindowMinutes: DEDUP_MIN,
            excludeActiveRoles: ["waiter"],
          },
          sb,
        );
        if ((sent || 0) > 0) shoppingPings += 1;
        // ...and the same "please do the shopping" nudge as an EMAIL to
        // admin + shopping + kitchen (waiters excluded). Deduped per day.
        emailPings += await queueStaffReminderEmails(
          sb,
          o.company_id,
          o.id,
          ["company_admin", "admin", "owner", "shopping_staff", "kitchen_manager", "kitchen_staff"],
          "event_shopping_lead_email",
          `🛒 Please do the shopping: ${orderLabel}`,
          `${shopMsg}\n\nOpen the shopping list to see what's outstanding for ${orderLabel}.`,
          ["waiter"],
        );
      }

      // Beyond the day-before, only the shopping lead applies - prep and
      // dispatch cues would be premature this far out.
      if (daysUntil >= 2) continue;

      // ---------- DAY BEFORE (daysUntil === 1) ----------
      if (daysUntil === 1) {
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
        // Same message as an EMAIL to admin/owner (Raj 2026-07-05: staff
        // who aren't watching the bell should still hear about tomorrow).
        emailPings += await queueStaffReminderEmails(
          sb,
          o.company_id,
          o.id,
          ["company_admin", "admin", "owner"],
          "event_tomorrow_admin_email",
          `🗓️ Event tomorrow: ${orderLabel}`,
          `${eventName}${venue ? ` at ${venue}` : ""} is tomorrow.\n\n` +
            `Please make sure prep, equipment and the driver run are all lined up.\n\n` +
            `Log in to your CateringMS dashboard to review ${orderLabel}.`,
        );
        // Kitchen prep heads-up - only if prep hasn't started. Shopping has
        // its own reminder above, so this is purely about cooking.
        let kitchenSent = 0;
        if (!prepBegun) {
          kitchenSent = await notificationService.broadcastNotification(
            {
              companyId: o.company_id,
              regionId: o.region_id || null,
              targetRoles: ["kitchen_manager" as any, "kitchen_staff" as any],
              title: `👩‍🍳 Prep for tomorrow: ${orderLabel}`,
              message: `${eventName} is tomorrow. Get prep started so it's ready in time.`,
              type: TYPE_TOMORROW_KITCHEN,
              priority: "normal",
              link: "/team-portal/kitchen/today",
              relatedEntityType: "order",
              relatedEntityId: o.id,
              dedup: true,
              dedupWindowMinutes: DEDUP_MIN,
              // Waiters share base role kitchen_staff - they don't cook,
              // so keep them off the prep ping.
              excludeActiveRoles: ["waiter"],
            },
            sb,
          );
          // ...and the same prep heads-up as an EMAIL to the kitchen crew.
          emailPings += await queueStaffReminderEmails(
            sb,
            o.company_id,
            o.id,
            ["kitchen_manager", "kitchen_staff"],
            "event_tomorrow_kitchen_email",
            `👩‍🍳 Prep for tomorrow: ${orderLabel}`,
            `${eventName}${venue ? ` at ${venue}` : ""} is tomorrow.\n\n` +
              `Get prep started so everything is ready in time.\n\n` +
              `Open the kitchen portal to see the prep list for ${orderLabel}.`,
            ["waiter"],
          );
        }
        if ((adminSent || 0) > 0 || (kitchenSent || 0) > 0) tomorrowPings += 1;
        else skipped += 1;
        continue;
      }

      // ---------- SAME DAY (daysUntil === 0) ----------
      // Effective event start (mirror order-sla-monitor's fallbacks).
      const timeStr = o.event_time || o.delivery_time || o.pickup_time || o.setup_time || "12:00:00";
      const eventStart = new Date(`${o.event_date}T${timeStr}`);
      if (Number.isNaN(eventStart.getTime())) { skipped += 1; continue; }
      const minsUntilEvent = (eventStart.getTime() - now.getTime()) / 60000;

      // Kitchen: start prep now (within lead, prep not begun). prepBegun
      // was computed once at the top of the loop.
      if (!prepBegun && minsUntilEvent <= KITCHEN_PREP_LEAD_H * 60 && minsUntilEvent > -120) {
        const sent = await notificationService.broadcastNotification(
          {
            companyId: o.company_id,
            regionId: o.region_id || null,
            targetRoles: ["kitchen_manager" as any, "kitchen_staff" as any],
            title: `🔥 Start prep now: ${orderLabel}`,
            message: `${eventName}${venue ? ` at ${venue}` : ""} is today (in ${Math.max(0, Math.round(minsUntilEvent / 60))}h). Prep hasn't started - get it going now.`,
            type: TYPE_DAY_KITCHEN,
            priority: "high",
            link: "/team-portal/kitchen/today",
            relatedEntityType: "order",
            relatedEntityId: o.id,
            dedup: true,
            dedupWindowMinutes: DEDUP_MIN,
            excludeActiveRoles: ["waiter"],
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
    shoppingPings,
    tomorrowPings,
    kitchenPings,
    driverPings,
    emailPings,
    skipped,
    errors_count: errors.length,
  });

  return res.status(200).json({
    ok: true,
    checked: (orders || []).length,
    shoppingPings,
    tomorrowPings,
    kitchenPings,
    driverPings,
    emailPings,
    skipped,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}

export default withApiLogging(handler);
