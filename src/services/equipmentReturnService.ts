/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * "Equipment is back at base" for one order - shared by the driver's
 * collection trip ("Equipment back at base") and the waiter's
 * "Equipment returned" on jobs where the waiter brings the gear back
 * (no collection trip is created when requires_waiter is set).
 *
 * Before this, only the driver path freed the bookings, recorded damage
 * and told the cleaning team; a waiter's tap just stamped a time, so
 * waiter-run jobs left their equipment "booked", cleaning was never told
 * the gear was back and damage had no place to be recorded.
 *
 * Every step is best-effort: a failure is logged and the rest carries on,
 * and an operator can redo any single cleanup from /admin/equipment.
 */
import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";
import { EQUIPMENT_RETURN_ADMIN_ROLES } from "@/lib/equipmentReturn";

export type ReturnDamageType = "damaged" | "broken" | "lost" | "stolen";

export interface ReturnDamage {
  equipmentId: string;
  quantityDamaged: number;
  damageType: ReturnDamageType;
  unitCost: number;
  description?: string;
  photoUrl?: string;
}

export interface ReturnOrderEquipmentResult {
  bookingsReturned: number;
  damagesRecorded: number;
  cleaningNotified: boolean;
  /** Units booked out / counted back / missing / damaged on this return. */
  booked: number;
  back: number;
  missing: number;
  damaged: number;
}

/** Units that did not come back at all (lost / stolen), per equipment id. */
export function missingUnitsByEquipment(damages: ReturnDamage[] = []): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of damages) {
    if (d.damageType !== "lost" && d.damageType !== "stolen") continue;
    const n = Math.max(0, Math.floor(Number(d.quantityDamaged) || 0));
    if (n > 0) out.set(d.equipmentId, (out.get(d.equipmentId) || 0) + n);
  }
  return out;
}

export const equipmentReturnService = {
  async returnOrderEquipment(params: {
    orderId: string;
    /** Driver or waiter bringing the gear back; damage is charged to them. */
    responsibleUserId: string;
    damages?: ReturnDamage[];
  }): Promise<ReturnOrderEquipmentResult> {
    const { orderId, responsibleUserId } = params;
    const damages = (params.damages || []).filter((d) => d.equipmentId && Number(d.quantityDamaged) > 0);
    const result: ReturnOrderEquipmentResult = {
      bookingsReturned: 0, damagesRecorded: 0, cleaningNotified: false,
      booked: 0, back: 0, missing: 0, damaged: 0,
    };
    for (const d of damages) {
      if (d.damageType === "lost" || d.damageType === "stolen") result.missing += Number(d.quantityDamaged) || 0;
      else result.damaged += Number(d.quantityDamaged) || 0;
    }

    // 1. Damage, charged to the person returning the gear (not cleaning).
    if (damages.length > 0) {
      const { equipmentTrackingService } = await import("@/services/equipmentTrackingService");
      for (const d of damages) {
        try {
          await (equipmentTrackingService as any).reportDamage({
            orderId,
            equipmentId: d.equipmentId,
            quantityDamaged: d.quantityDamaged,
            damageType: d.damageType,
            damageStage: "return",
            unitCost: d.unitCost,
            responsibleUserId,
            description: d.description,
            photoUrl: d.photoUrl,
          });
          result.damagesRecorded += 1;
        } catch (e) {
          console.warn("[equipmentReturn] damage report failed for", d.equipmentId, e);
        }
      }
    }

    // 2. Free the bookings. Lost / stolen units did not come back, so the
    //    returned quantity excludes them (spread across that equipment's
    //    bookings) and availability is not over-credited.
    try {
      const { data: bookings } = await (supabase as any)
        .from("equipment_bookings")
        .select("id, status, equipment_id, quantity")
        .eq("order_id", orderId);
      const missing = missingUnitsByEquipment(damages);
      const { equipmentService } = await import("@/services/equipmentService");
      for (const b of (bookings || []) as any[]) {
        if (b.status === "returned" || b.status === "cancelled") continue;
        const qty = Math.max(0, Number(b.quantity || 0));
        const short = Math.min(qty, missing.get(b.equipment_id) || 0);
        if (short > 0) missing.set(b.equipment_id, (missing.get(b.equipment_id) || 0) - short);
        result.booked += qty;
        result.back += qty - short;
        try {
          await (equipmentService as any).returnEquipment(b.id, qty - short);
          result.bookingsReturned += 1;
          // Who brought it back, and when (shown on the order page).
          const { error: stampErr } = await (supabase as any)
            .from("equipment_bookings")
            .update({ returned_at: new Date().toISOString(), returned_by_user_id: responsibleUserId })
            .eq("id", b.id);
          if (stampErr) console.warn("[equipmentReturn] returned-by stamp failed for booking", b.id, stampErr.message);
        } catch (e) {
          console.warn("[equipmentReturn] returnEquipment failed for booking", b.id, e);
        }
      }
    } catch (e) {
      console.warn("[equipmentReturn] booking return crashed (non-blocking):", e);
    }

    // 3. Tell the cleaning team there is a return to process.
    try {
      const { data: order } = await (supabase as any)
        .from("orders")
        .select("company_id, order_number")
        .eq("id", orderId)
        .maybeSingle();
      const companyId = (order as any)?.company_id;
      if (companyId) {
        await notificationService.broadcastNotification({
          companyId,
          type: "equipment_returned",
          title: "Equipment returned for cleaning",
          message: `Gear from order ${(order as any)?.order_number || orderId.slice(0, 8)} is back at the hub and ready for cleaning intake.`,
          targetRoles: ["cleaning_manager" as any, "cleaning_staff" as any],
          managerDispatch: true,
          priority: "normal",
          link: "/team-portal/cleaning",
          relatedEntityType: "order",
          relatedEntityId: orderId,
          dedup: true,
        } as any);
        result.cleaningNotified = true;

        // Office: one summary for both return paths (driver collection
        // trip and waiter return) - who brought it back and the count.
        let who = "The team";
        try {
          const { data: prof } = await (supabase as any)
            .from("profiles").select("full_name, email").eq("id", responsibleUserId).maybeSingle();
          who = (prof as any)?.full_name || (prof as any)?.email || who;
        } catch { /* name is cosmetic */ }
        const problems = result.missing + result.damaged;
        await notificationService.broadcastNotification({
          companyId,
          type: problems > 0 ? "equipment_returned_with_issues" : "equipment_returned_admin",
          title: problems > 0
            ? `Equipment back with issues: ${(order as any)?.order_number || orderId.slice(0, 8)}`
            : `Equipment back at base: ${(order as any)?.order_number || orderId.slice(0, 8)}`,
          message: `${who} brought the equipment back: ${result.back} of ${result.booked} counted in`
            + `${result.missing ? `, ${result.missing} missing` : ""}${result.damaged ? `, ${result.damaged} damaged` : ""}.`,
          targetRoles: [...EQUIPMENT_RETURN_ADMIN_ROLES] as any,
          priority: problems > 0 ? "high" : "normal",
          link: `/admin/orders?orderId=${orderId}`,
          relatedEntityType: "order",
          relatedEntityId: orderId,
          dedup: true,
        } as any);
      }
    } catch (e) {
      console.warn("[equipmentReturn] return notifications failed (non-blocking):", e);
    }

    return result;
  },
};
