/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Overdue reminders for equipment the WAITER is responsible for bringing
 * back ("Equipment return: Waiter brings it back").
 *
 * Driver collections are tracked as a driver_assignments trip and
 * reminded by /api/cron/equipment-collection-reminder. Waiter returns
 * have no trip, so before this nobody noticed when a waiter never marked
 * the equipment returned. Run from that same cron (07:00 + 18:00): for
 * recent waiter-return orders whose return is overdue (computeReturnStatus,
 * a few hours after the waiter closed the event, or after the booked
 * service window), ping the order's waiters and the company admins.
 * Deduped per order for 18h, so each overdue return is raised about
 * twice a day until it is done.
 */
import { tenantDateTime } from "@/lib/portalTime";
import { notificationService } from "@/services/notificationService";
import { EQUIPMENT_RETURN_ADMIN_ROLES, computeReturnStatus, resolveEquipmentReturn } from "@/lib/equipmentReturn";

/** Look back this many days for unreturned waiter jobs. */
const LOOKBACK_DAYS = 7;

export async function runWaiterReturnReminders(sb: any, now: Date = new Date()): Promise<{
  considered: number;
  overdue: number;
  waiterPings: number;
  adminPings: number;
  errors: string[];
}> {
  const out = { considered: 0, overdue: 0, waiterPings: 0, adminPings: 0, errors: [] as string[] };
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  const { data: orders, error } = await sb
    .from("orders")
    .select("id, company_id, region_id, order_number, event_name, venue_name, venue_address, event_date, event_time, status, equipment_return_method, collection_next_day, requires_waiter, waiter_service_required, waiter_duration_hours")
    .gte("event_date", from)
    .lte("event_date", to)
    .in("status", ["delivered", "completed"])
    .is("deleted_at", null);
  if (error) {
    out.errors.push(`orders: ${error.message}`);
    return out;
  }

  for (const o of (orders || []) as any[]) {
    if (resolveEquipmentReturn(o) !== "waiter") continue;
    out.considered += 1;
    try {
      const [{ data: attendance }, { data: bookings }] = await Promise.all([
        sb.from("event_attendance").select("waiter_id, event_complete_at, equipment_returned_at").eq("order_id", o.id),
        sb.from("equipment_bookings").select("quantity, returned_quantity, status").eq("order_id", o.id),
      ]);
      const start = (tenantDateTime(o.event_date, String(o.event_time || "12:00").slice(0, 5)) ?? new Date(NaN));
      const status = computeReturnStatus({
        method: "waiter",
        now,
        eventStart: Number.isNaN(start.getTime()) ? null : start,
        waiterHours: o.waiter_duration_hours ?? null,
        attendance: (attendance || []) as any[],
        bookings: (bookings || []) as any[],
      });
      if (status.state !== "overdue") continue;
      out.overdue += 1;

      const label = o.event_name || o.order_number || "an event";
      const where = o.venue_name || String(o.venue_address || "").split(",")[0] || "the venue";
      const title = "⚠️ Equipment not returned";
      const waiterIds = Array.from(new Set(((attendance || []) as any[]).map((a) => a.waiter_id).filter(Boolean)));

      for (const waiterId of waiterIds) {
        try {
          const created = await notificationService.createNotification({
            company_id: o.company_id,
            recipient_id: waiterId,
            user_id: waiterId,
            notification_type: "waiter_equipment_return_overdue",
            title,
            message: `You're bringing back the equipment from ${label} (${where}). It hasn't been marked returned yet - count it in on your dashboard.`,
            priority: "high",
            link: "/team-portal/waiter/dashboard",
            related_entity_type: "order",
            related_entity_id: o.id,
            dedup: true,
            dedupWindowMinutes: 18 * 60,
          } as any, sb);
          if (created) out.waiterPings += 1;
        } catch (e: any) {
          out.errors.push(`order ${o.id} waiter ${waiterId}: ${e?.message || e}`);
        }
      }

      try {
        const sent = await notificationService.broadcastNotification({
          companyId: o.company_id,
          regionId: o.region_id || null,
          targetRoles: [...EQUIPMENT_RETURN_ADMIN_ROLES] as any,
          title,
          message: `The waiter is bringing back the equipment from ${label} (${where}), but it hasn't been marked returned. ${status.booked} item${status.booked === 1 ? "" : "s"} still out${waiterIds.length ? "" : " - no waiter has checked in on this job"}.`,
          type: "waiter_equipment_return_overdue_admin",
          priority: "high",
          link: `/admin/orders?orderId=${o.id}`,
          relatedEntityType: "order",
          relatedEntityId: o.id,
          dedup: true,
          dedupWindowMinutes: 18 * 60,
        } as any, sb);
        if ((sent || 0) > 0) out.adminPings += 1;
      } catch (e: any) {
        out.errors.push(`order ${o.id} admin: ${e?.message || e}`);
      }
    } catch (e: any) {
      out.errors.push(`order ${o.id}: ${e?.message || e}`);
    }
  }
  return out;
}
