/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Office actions + notifications around "who brings the equipment back".
 *
 *   bookOrReassignCollection - admin books the driver collection trip (e.g.
 *     the order had no driver at delivery, so none was created) or hands it
 *     to another driver. New driver is told; the previous one is told it
 *     moved.
 *   changeEquipmentReturn - admin changes the order's "Equipment return".
 *     Keeps the collection trip in step (cancel it when a waiter / the
 *     client now returns the gear; book it with the order's driver when a
 *     driver collection is chosen after delivery; re-time it when same-day
 *     <-> next-day changes) and tells everyone affected.
 *   notifyWaitersResponsible - tells the order's waiters they are bringing
 *     the equipment back (on delivery, and when the choice changes to
 *     waiter).
 *   alertNoCollectionDriver - office alert when a driver collection is
 *     needed but nobody can be given the trip.
 *
 * Every notification is best-effort and deduped; a failed ping never
 * blocks the change itself.
 */
import { supabase as browserClient } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notificationService";
import {
  EQUIPMENT_RETURN_ADMIN_ROLES, EQUIPMENT_RETURN_OPTIONS, collectionScheduledFor, isDriverCollection,
  resolveEquipmentReturn, type EquipmentReturnMethod,
} from "@/lib/equipmentReturn";

const OPEN_TRIP_STATUSES = ["assigned", "accepted"];
const fmtWhen = (d: Date) => d.toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface OrderCtx {
  id: string;
  company_id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string | null;
  event_time: string | null;
  venue_name?: string | null;
  venue_address: string | null;
  assigned_driver_id: string | null;
  delivered_at: string | null;
  status: string | null;
  equipment_return_method: string | null;
  collection_next_day: boolean | null;
  requires_waiter: boolean | null;
  waiter_service_required: boolean | null;
}

async function loadOrder(db: any, orderId: string): Promise<OrderCtx | null> {
  const { data } = await db
    .from("orders")
    .select("id, company_id, order_number, event_name, event_date, event_time, venue_name, venue_address, assigned_driver_id, delivered_at, status, equipment_return_method, collection_next_day, requires_waiter, waiter_service_required")
    .eq("id", orderId)
    .maybeSingle();
  return (data as OrderCtx) || null;
}

const label = (o: OrderCtx) => o.event_name || o.order_number || "an event";
const where = (o: OrderCtx) => o.venue_name || String(o.venue_address || "").split(",")[0] || "the venue";

async function pingUser(db: any, o: OrderCtx, userId: string, type: string, title: string, message: string, link: string) {
  try {
    await notificationService.createNotification({
      company_id: o.company_id,
      recipient_id: userId,
      user_id: userId,
      notification_type: type,
      title,
      message,
      priority: "normal",
      link,
      related_entity_type: "order",
      related_entity_id: o.id,
      dedup: true,
      dedupWindowMinutes: 30,
    } as any, db);
  } catch (e) {
    console.warn(`[equipmentReturnOps] ${type} ping failed (non-blocking):`, e);
  }
}

async function pingOffice(db: any, o: OrderCtx, type: string, title: string, message: string, priority: "normal" | "high" = "normal") {
  try {
    await notificationService.broadcastNotification({
      companyId: o.company_id,
      type,
      title,
      message,
      targetRoles: [...EQUIPMENT_RETURN_ADMIN_ROLES] as any,
      priority,
      link: `/admin/orders?orderId=${o.id}`,
      relatedEntityType: "order",
      relatedEntityId: o.id,
      dedup: true,
      dedupWindowMinutes: 60,
    } as any, db);
  } catch (e) {
    console.warn(`[equipmentReturnOps] ${type} office ping failed (non-blocking):`, e);
  }
}

/** Waiters on the order (event_attendance is the waiter assignment table). */
async function orderWaiterIds(db: any, orderId: string): Promise<string[]> {
  const { data } = await db.from("event_attendance").select("waiter_id").eq("order_id", orderId);
  return Array.from(new Set(((data || []) as any[]).map((r) => r.waiter_id).filter(Boolean)));
}

export async function notifyWaitersResponsible(orderId: string, db: any = browserClient): Promise<number> {
  const o = await loadOrder(db, orderId);
  if (!o) return 0;
  const ids = await orderWaiterIds(db, orderId);
  for (const id of ids) {
    await pingUser(db, o, id, "equipment_return_waiter_responsible",
      "You're bringing the equipment back",
      `For ${label(o)} (${where(o)}), you bring the equipment back after service. Count it in on your dashboard with "Equipment returned".`,
      "/team-portal/waiter/dashboard");
  }
  if (ids.length === 0) {
    await pingOffice(db, o, "equipment_return_no_waiter",
      `No waiter to bring equipment back: ${o.order_number || label(o)}`,
      `"Waiter brings it back" is set for ${label(o)}, but no waiter is assigned. Assign a waiter or change who returns the equipment.`,
      "high");
  }
  return ids.length;
}

export async function alertNoCollectionDriver(orderId: string, db: any = browserClient): Promise<void> {
  const o = await loadOrder(db, orderId);
  if (!o) return;
  await pingOffice(db, o, "collection_no_driver",
    `Collection needs a driver: ${o.order_number || label(o)}`,
    `${label(o)} (${where(o)}) is delivered and the equipment must be collected by a driver, but nobody is assigned. Book the collection on the order.`,
    "high");
}

export async function bookOrReassignCollection(params: {
  orderId: string;
  driverId: string;
  db?: any;
}): Promise<{ ok: boolean; mode?: "booked" | "reassigned" | "unchanged"; scheduledFor?: string; error?: string }> {
  const db = params.db || browserClient;
  const o = await loadOrder(db, params.orderId);
  if (!o) return { ok: false, error: "Order not found." };
  const method = resolveEquipmentReturn(o);
  if (!isDriverCollection(method)) return { ok: false, error: "This order isn't set to a driver collection." };

  const { data: trip } = await db
    .from("driver_assignments")
    .select("id, driver_id, status, scheduled_for")
    .eq("order_id", o.id)
    .eq("assignment_type", "collection")
    .neq("status", "cancelled")
    .maybeSingle();

  const link = `/team-portal/driver/deliveries?orderId=${o.id}`;
  if (trip) {
    if ((trip as any).driver_id === params.driverId) return { ok: true, mode: "unchanged", scheduledFor: (trip as any).scheduled_for };
    if (!OPEN_TRIP_STATUSES.includes(String((trip as any).status))) {
      return { ok: false, error: "The collection has already started, so it can't be handed to another driver." };
    }
    // Read before the update: the previous driver is told it moved.
    const previousDriverId: string | null = (trip as any).driver_id || null;
    const { error } = await db
      .from("driver_assignments")
      .update({ driver_id: params.driverId, status: "assigned", assigned_at: new Date().toISOString() })
      .eq("id", (trip as any).id);
    if (error) return { ok: false, error: error.message };
    const when = (trip as any).scheduled_for ? fmtWhen(new Date((trip as any).scheduled_for)) : "soon";
    await pingUser(db, o, params.driverId, "collection_assigned", "Collection trip assigned to you",
      `Collect the equipment from ${label(o)} (${where(o)}) - ${when}.`, link);
    if (previousDriverId) {
      await pingUser(db, o, previousDriverId, "collection_unassigned", "Collection trip moved",
        `The equipment collection for ${label(o)} has been given to another driver. You don't need to do it.`, "/team-portal/driver/dashboard");
    }
    return { ok: true, mode: "reassigned", scheduledFor: (trip as any).scheduled_for };
  }

  const scheduledFor = collectionScheduledFor(o.event_date, o.event_time, method);
  const { data: delivery } = await db
    .from("driver_assignments")
    .select("id")
    .eq("order_id", o.id)
    .eq("assignment_type", "delivery")
    .maybeSingle();
  const { error } = await db.from("driver_assignments").insert({
    company_id: o.company_id,
    order_id: o.id,
    driver_id: params.driverId,
    assignment_type: "collection",
    scheduled_for: scheduledFor.toISOString(),
    parent_assignment_id: (delivery as any)?.id || null,
    status: "assigned",
    notes: "Collection trip: return to venue, pick up equipment, deliver to kitchen for cleaning.",
  });
  if (error) return { ok: false, error: error.message };
  await pingUser(db, o, params.driverId, "collection_assigned", "Collection trip assigned to you",
    `Collect the equipment from ${label(o)} (${where(o)}) - ${fmtWhen(scheduledFor)}.`, link);
  return { ok: true, mode: "booked", scheduledFor: scheduledFor.toISOString() };
}

export async function changeEquipmentReturn(params: {
  orderId: string;
  next: EquipmentReturnMethod;
  db?: any;
}): Promise<{ ok: boolean; notes: string[]; error?: string }> {
  const db = params.db || browserClient;
  const o = await loadOrder(db, params.orderId);
  if (!o) return { ok: false, notes: [], error: "Order not found." };
  const prev = resolveEquipmentReturn(o);
  const next = params.next;
  const notes: string[] = [];

  const { error } = await db
    .from("orders")
    .update({ equipment_return_method: next, collection_next_day: next === "driver_next_day" })
    .eq("id", o.id);
  if (error) return { ok: false, notes, error: error.message };
  const after: OrderCtx = { ...o, equipment_return_method: next, collection_next_day: next === "driver_next_day" };

  const { data: trip } = await db
    .from("driver_assignments")
    .select("id, driver_id, status, scheduled_for")
    .eq("order_id", o.id)
    .eq("assignment_type", "collection")
    .neq("status", "cancelled")
    .maybeSingle();
  const delivered = !!o.delivered_at || ["delivered", "completed"].includes(String(o.status || ""));

  if (!isDriverCollection(next) && trip && OPEN_TRIP_STATUSES.includes(String((trip as any).status))) {
    // Nobody needs to drive out any more: cancel the trip and tell the driver.
    await db.from("driver_assignments").update({ status: "cancelled" }).eq("id", (trip as any).id);
    await pingUser(db, after, (trip as any).driver_id, "collection_cancelled", "Collection trip cancelled",
      `You no longer need to collect the equipment from ${label(after)}: ${EQUIPMENT_RETURN_OPTIONS[next].responsible.toLowerCase()}.`,
      "/team-portal/driver/dashboard");
    notes.push("Collection trip cancelled and the driver told.");
  } else if (!isDriverCollection(next) && trip) {
    notes.push("The collection trip has already started; it was left as it is.");
  }

  if (isDriverCollection(next)) {
    if (trip && OPEN_TRIP_STATUSES.includes(String((trip as any).status)) && prev !== next) {
      // Same-day <-> next-day: re-time the trip and tell the driver.
      const at = collectionScheduledFor(o.event_date, o.event_time, next);
      await db.from("driver_assignments").update({ scheduled_for: at.toISOString() }).eq("id", (trip as any).id);
      await pingUser(db, after, (trip as any).driver_id, "collection_rescheduled", "Collection time changed",
        `The equipment collection for ${label(after)} (${where(after)}) is now ${fmtWhen(at)}.`,
        `/team-portal/driver/deliveries?orderId=${o.id}`);
      notes.push(`Collection moved to ${fmtWhen(at)} and the driver told.`);
    } else if (!trip && delivered) {
      // Already delivered, so the automatic booking has passed: book it
      // with the order's driver, or alert the office to pick one.
      if (o.assigned_driver_id) {
        const r = await bookOrReassignCollection({ orderId: o.id, driverId: o.assigned_driver_id, db });
        notes.push(r.ok ? "Collection trip booked with the order's driver." : `Couldn't book the collection: ${r.error}`);
      } else {
        await alertNoCollectionDriver(o.id, db);
        notes.push("No driver on this order - choose one to book the collection.");
      }
    } else if (!trip) {
      notes.push("The collection trip is booked automatically when the order is delivered.");
    }
  }

  if (next === "waiter" && prev !== "waiter") {
    const n = await notifyWaitersResponsible(o.id, db);
    notes.push(n > 0 ? `${n} waiter${n === 1 ? "" : "s"} told they bring the equipment back.` : "No waiter assigned yet - the office was alerted.");
  }
  if (prev === "waiter" && next !== "waiter") {
    for (const id of await orderWaiterIds(db, o.id)) {
      await pingUser(db, after, id, "equipment_return_waiter_released", "You don't need to bring the equipment back",
        `For ${label(after)}: ${EQUIPMENT_RETURN_OPTIONS[next].responsible.toLowerCase()}.`, "/team-portal/waiter/dashboard");
    }
  }
  return { ok: true, notes };
}
