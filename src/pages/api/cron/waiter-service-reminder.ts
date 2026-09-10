/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET/POST /api/cron/waiter-service-reminder
 *
 * Waiter/service-role operational reminders.
 *
 * Closes the gap left by the generic event reminder cron: shopping,
 * kitchen and driver were prompted before event day, but waiter service
 * needed its own checks after the dedicated waiter assignment workflow
 * was added.
 *
 * Layers:
 *   1. Service required but no waiter assigned within the next 2 days:
 *      notify admins/owners so they assign someone from the order page.
 *   2. Assigned waiter has not tapped "On site" within 3h of event:
 *      notify that waiter with a direct order brief link.
 *   3. Event start passed and assigned waiter still has no arrival tap:
 *      escalate to admins/owners as a no-show risk.
 *
 * Schedule: every 15 minutes in vercel.json.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { UserRole } from "@/types/app";

const CRON_NAME = "waiter-service-reminder";
const TYPE_UNASSIGNED = "waiter_service_unassigned";
const TYPE_WAITER_DUE = "waiter_service_due";
const TYPE_NO_SHOW = "waiter_service_no_show";

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready", "in_transit", "delivered"];
const LOOKAHEAD_DAYS = 2;
const WAITER_LEAD_HOURS = 3;
const NO_SHOW_GRACE_MINUTES = 15;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eventStartFor(order: any): Date | null {
  const time = order.event_time || order.delivery_time || order.pickup_time || order.setup_time || "12:00:00";
  const parsed = new Date(`${order.event_date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eventLabel(order: any): string {
  return order.event_name && order.event_name !== "Untitled"
    ? order.event_name
    : "the event";
}

function venueLabel(order: any): string {
  return order.venue_name || (order.venue_address ? String(order.venue_address).split(",")[0] : "");
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const now = new Date();
  const today = dateIso(now);
  const horizon = dateIso(addDays(now, LOOKAHEAD_DAYS));

  const { data: orders, error } = await sb
    .from("orders")
    .select(
      "id, company_id, region_id, order_number, status, event_date, event_time, " +
        "delivery_time, pickup_time, setup_time, venue_name, venue_address, event_name, " +
        "comms_paused_until, requires_waiter, waiter_service_required, deleted_at",
    )
    .gte("event_date", today)
    .lte("event_date", horizon)
    .in("status", ACTIVE_STATUSES)
    .or("requires_waiter.eq.true,waiter_service_required.eq.true")
    .is("deleted_at", null)
    .limit(1000);

  if (error) {
    console.error("[cron/waiter-service-reminder] orders fetch failed:", error);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
    return res.status(500).json({ error: error.message });
  }

  const orderIds = ((orders || []) as any[]).map((o) => o.id);
  const attendanceByOrder = new Map<string, any[]>();
  const waiterIds = new Set<string>();

  if (orderIds.length > 0) {
    const { data: attendanceRows, error: attendanceErr } = await sb
      .from("event_attendance")
      .select("id, company_id, order_id, waiter_id, arrived_at, setup_started_at, service_started_at, event_complete_at")
      .in("order_id", orderIds);
    if (attendanceErr) {
      console.warn("[cron/waiter-service-reminder] attendance fetch failed:", attendanceErr.message);
    }
    for (const row of (attendanceRows || []) as any[]) {
      const rows = attendanceByOrder.get(row.order_id) || [];
      rows.push(row);
      attendanceByOrder.set(row.order_id, rows);
      if (row.waiter_id) waiterIds.add(row.waiter_id);
    }
  }

  const waiterProfiles = new Map<string, { full_name: string | null; email: string | null }>();
  if (waiterIds.size > 0) {
    const { data: profiles, error: profilesErr } = await sb
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(waiterIds));
    if (profilesErr) {
      console.warn("[cron/waiter-service-reminder] waiter profile fetch failed:", profilesErr.message);
    }
    for (const p of (profiles || []) as any[]) {
      waiterProfiles.set(p.id, { full_name: p.full_name || null, email: p.email || null });
    }
  }

  const { notificationService } = await import("@/services/notificationService");
  let unassignedAlerts = 0;
  let waiterReminders = 0;
  let noShowAlerts = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const order of (orders || []) as any[]) {
    try {
      if (order.comms_paused_until && new Date(order.comms_paused_until).getTime() > now.getTime()) {
        skipped += 1;
        continue;
      }

      const start = eventStartFor(order);
      if (!start) {
        skipped += 1;
        continue;
      }

      const minutesUntil = (start.getTime() - now.getTime()) / 60000;
      const orderLabel = order.order_number || String(order.id).slice(0, 8);
      const eventName = eventLabel(order);
      const venue = venueLabel(order);
      const adminLink = `/admin/orders?orderId=${order.id}`;
      const waiterLink = `/order/${order.id}?role=waiter`;
      const attendance = attendanceByOrder.get(order.id) || [];

      if (attendance.length === 0) {
        if (minutesUntil > -60) {
          const sent = await notificationService.broadcastNotification(
            {
              companyId: order.company_id,
              regionId: order.region_id || null,
              targetRoles: [
                UserRole.SUPER_ADMIN,
                UserRole.OWNER,
                UserRole.COMPANY_ADMIN,
                UserRole.ADMIN,
                UserRole.REGION_ADMIN,
              ] as any,
              title: `Waiter not assigned: ${orderLabel}`,
              message:
                `${eventName}${venue ? ` at ${venue}` : ""} needs waiter service, ` +
                "but no waiter is assigned yet. Open the order Service team section and assign one now.",
              type: TYPE_UNASSIGNED,
              priority: minutesUntil <= 24 * 60 ? "high" : "normal",
              link: `${adminLink}#section-waiter`,
              relatedEntityType: "order",
              relatedEntityId: order.id,
              dedup: true,
              dedupWindowMinutes: 12 * 60,
            },
            sb,
          );
          if ((sent || 0) > 0) unassignedAlerts += 1;
          else skipped += 1;
        }
        continue;
      }

      for (const row of attendance) {
        if (row.arrived_at) continue;
        const profile = waiterProfiles.get(row.waiter_id);
        const waiterName = profile?.full_name || profile?.email || "Assigned waiter";

        if (minutesUntil <= WAITER_LEAD_HOURS * 60 && minutesUntil > -NO_SHOW_GRACE_MINUTES) {
          const created = await notificationService.createNotification(
            {
              company_id: order.company_id,
              recipient_id: row.waiter_id,
              user_id: row.waiter_id,
              notification_type: TYPE_WAITER_DUE,
              title: `Service today: ${orderLabel}`,
              message:
                `${eventName}${venue ? ` at ${venue}` : ""} is coming up. ` +
                "Open the brief, check the service notes and tap On site when you arrive.",
              priority: "high",
              target_role: UserRole.WAITER,
              link: waiterLink,
              related_entity_type: "order",
              related_entity_id: order.id,
              dedup: true,
              dedupWindowMinutes: 12 * 60,
            },
            sb,
          );
          if (created) waiterReminders += 1;
          else skipped += 1;
        }

        if (minutesUntil <= -NO_SHOW_GRACE_MINUTES && minutesUntil > -180) {
          const sent = await notificationService.broadcastNotification(
            {
              companyId: order.company_id,
              regionId: order.region_id || null,
              targetRoles: [
                UserRole.SUPER_ADMIN,
                UserRole.OWNER,
                UserRole.COMPANY_ADMIN,
                UserRole.ADMIN,
                UserRole.REGION_ADMIN,
              ] as any,
              title: `Waiter no-show risk: ${waiterName}`,
              message:
                `${waiterName} is assigned to ${orderLabel}, but has not tapped On site. ` +
                `${eventName}${venue ? ` at ${venue}` : ""} started ${Math.abs(Math.round(minutesUntil))} minutes ago.`,
              type: TYPE_NO_SHOW,
              priority: "urgent",
              link: `${adminLink}#section-waiter`,
              relatedEntityType: "order",
              relatedEntityId: order.id,
              dedup: true,
              dedupWindowMinutes: 60,
            },
            sb,
          );
          if ((sent || 0) > 0) noShowAlerts += 1;
          else skipped += 1;
        }
      }
    } catch (e: any) {
      errors.push(`${order.id}: ${e?.message || String(e)}`);
    }
  }

  if (errors.length > 0) {
    console.warn("[cron/waiter-service-reminder] per-order errors:", errors);
  }

  await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
    source: auth.source,
    checked: (orders || []).length,
    unassignedAlerts,
    waiterReminders,
    noShowAlerts,
    skipped,
    errors_count: errors.length,
  });

  return res.status(200).json({
    ok: true,
    checked: (orders || []).length,
    unassignedAlerts,
    waiterReminders,
    noShowAlerts,
    skipped,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
}

export default withApiLogging(handler);
