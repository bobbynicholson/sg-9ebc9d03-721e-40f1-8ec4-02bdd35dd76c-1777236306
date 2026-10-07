/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
const pings: any[] = [];
const office: any[] = [];
jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
jest.mock("@/services/notificationService", () => ({
  notificationService: {
    createNotification: async (p: any) => { pings.push(p); return { id: "n" }; },
    broadcastNotification: async (p: any) => { office.push(p); return 1; },
  },
}));
import { bookOrReassignCollection, changeEquipmentReturn } from "@/services/equipmentReturnOps";

/** Tiny in-memory Supabase: select / eq / neq / maybeSingle / insert / update. */
function makeDb(tables: Record<string, any[]>) {
  return {
    tables,
    from(table: string) {
      const where: Array<[string, "eq" | "neq", any]> = [];
      let op: "select" | "update" = "select";
      let values: any = null;
      const rows = () => (tables[table] || []).filter((r) => where.every(([k, c, v]) => (c === "eq" ? r[k] === v : r[k] !== v)));
      const api: any = {
        select: () => api,
        eq: (k: string, v: any) => { where.push([k, "eq", v]); return api; },
        neq: (k: string, v: any) => { where.push([k, "neq", v]); return api; },
        update: (v: any) => { op = "update"; values = v; return api; },
        insert: (v: any) => {
          (tables[table] = tables[table] || []).push({ id: `new-${table}`, ...v });
          return Promise.resolve({ error: null });
        },
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        then: (resolve: any) => {
          if (op === "update") {
            for (const r of rows()) Object.assign(r, values);
            return resolve({ error: null });
          }
          return resolve({ data: rows(), error: null });
        },
      };
      return api;
    },
  };
}

const baseOrder = {
  id: "o1", company_id: "c1", order_number: "ORD-1", event_name: "Wedding", event_date: "2026-10-10",
  event_time: "12:00", venue_name: "Hall", venue_address: "1 Main Rd", assigned_driver_id: "d1",
  delivered_at: null, status: "confirmed", equipment_return_method: "driver_same_day",
  collection_next_day: false, requires_waiter: true, waiter_service_required: true,
};

beforeEach(() => { pings.length = 0; office.length = 0; });

test("driver -> waiter: open trip cancelled, driver and waiters told", async () => {
  const db = makeDb({
    orders: [{ ...baseOrder }],
    driver_assignments: [{ id: "t1", order_id: "o1", assignment_type: "collection", driver_id: "d1", status: "assigned" }],
    event_attendance: [{ order_id: "o1", waiter_id: "w1" }],
  });
  const r = await changeEquipmentReturn({ orderId: "o1", next: "waiter", db });
  expect(r.ok).toBe(true);
  expect(db.tables.driver_assignments[0].status).toBe("cancelled");
  expect(db.tables.orders[0].equipment_return_method).toBe("waiter");
  expect(pings.map((p) => [p.recipient_id, p.notification_type])).toEqual([
    ["d1", "collection_cancelled"],
    ["w1", "equipment_return_waiter_responsible"],
  ]);
});

test("waiter -> driver after delivery: trip booked with the order's driver, waiters released", async () => {
  const db = makeDb({
    orders: [{ ...baseOrder, equipment_return_method: "waiter", delivered_at: "2026-10-10T11:00:00Z", status: "delivered" }],
    driver_assignments: [{ id: "del", order_id: "o1", assignment_type: "delivery", driver_id: "d1", status: "completed" }],
    event_attendance: [{ order_id: "o1", waiter_id: "w1" }],
  });
  const r = await changeEquipmentReturn({ orderId: "o1", next: "driver_next_day", db });
  expect(r.ok).toBe(true);
  const trip = db.tables.driver_assignments.find((t: any) => t.assignment_type === "collection");
  expect(trip).toMatchObject({ driver_id: "d1", status: "assigned", parent_assignment_id: "del" });
  expect(new Date(trip.scheduled_for).getHours()).toBe(9);
  expect(pings.map((p) => [p.recipient_id, p.notification_type])).toEqual([
    ["d1", "collection_assigned"],
    ["w1", "equipment_return_waiter_released"],
  ]);
});

test("driver collection after delivery with no driver: office alerted", async () => {
  const db = makeDb({
    orders: [{ ...baseOrder, assigned_driver_id: null, equipment_return_method: "none", delivered_at: "x", status: "delivered", requires_waiter: false, waiter_service_required: false }],
    driver_assignments: [],
    event_attendance: [],
  });
  await changeEquipmentReturn({ orderId: "o1", next: "driver_same_day", db });
  expect(office.map((o) => [o.type, o.priority])).toEqual([["collection_no_driver", "high"]]);
  expect(office[0].targetRoles).toEqual(["company_admin", "owner", "admin", "region_admin"]);
});

test("same day -> next day re-times the trip and tells the driver", async () => {
  const db = makeDb({
    orders: [{ ...baseOrder }],
    driver_assignments: [{ id: "t1", order_id: "o1", assignment_type: "collection", driver_id: "d1", status: "assigned", scheduled_for: "2026-10-10T17:00:00" }],
    event_attendance: [],
  });
  await changeEquipmentReturn({ orderId: "o1", next: "driver_next_day", db });
  expect(new Date(db.tables.driver_assignments[0].scheduled_for).getDate()).toBe(11);
  expect(pings.map((p) => p.notification_type)).toEqual(["collection_rescheduled"]);
});

test("waiter chosen but no waiter assigned: office alerted", async () => {
  const db = makeDb({ orders: [{ ...baseOrder }], driver_assignments: [], event_attendance: [] });
  await changeEquipmentReturn({ orderId: "o1", next: "waiter", db });
  expect(office.map((o) => o.type)).toEqual(["equipment_return_no_waiter"]);
});

test("reassign: new driver told, previous driver told it moved", async () => {
  const db = makeDb({
    orders: [{ ...baseOrder }],
    driver_assignments: [{ id: "t1", order_id: "o1", assignment_type: "collection", driver_id: "d1", status: "assigned", scheduled_for: "2026-10-10T17:00:00" }],
  });
  const r = await bookOrReassignCollection({ orderId: "o1", driverId: "d2", db });
  expect(r).toMatchObject({ ok: true, mode: "reassigned" });
  expect(db.tables.driver_assignments[0].driver_id).toBe("d2");
  expect(pings.map((p) => [p.recipient_id, p.notification_type])).toEqual([
    ["d2", "collection_assigned"],
    ["d1", "collection_unassigned"],
  ]);
});

test("a collection already under way can't be handed over", async () => {
  const db = makeDb({
    orders: [{ ...baseOrder }],
    driver_assignments: [{ id: "t1", order_id: "o1", assignment_type: "collection", driver_id: "d1", status: "en_route" }],
  });
  const r = await bookOrReassignCollection({ orderId: "o1", driverId: "d2", db });
  expect(r.ok).toBe(false);
  expect(pings).toEqual([]);
});
