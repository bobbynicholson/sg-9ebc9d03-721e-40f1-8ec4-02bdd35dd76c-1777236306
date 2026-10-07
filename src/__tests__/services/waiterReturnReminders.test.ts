/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
const pings: any[] = [];
const broadcasts: any[] = [];
jest.mock("@/services/notificationService", () => ({
  notificationService: {
    createNotification: async (p: any) => { pings.push(p); return { id: "n" }; },
    broadcastNotification: async (p: any) => { broadcasts.push(p); return 2; },
  },
}));
import { runWaiterReturnReminders } from "@/services/waiterReturnReminders";

function db(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, any]> = [];
      const api: any = {
        select: () => api, gte: () => api, lte: () => api, in: () => api, is: () => api,
        eq: (c: string, v: any) => { filters.push([c, v]); return api; },
        then: (resolve: any) => resolve({
          data: (tables[table] || []).filter((r) => filters.every(([c, v]) => r[c] === v)),
          error: null,
        }),
      };
      return api;
    },
  };
}

beforeEach(() => { pings.length = 0; broadcasts.length = 0; });

test("pings the waiter and admins only for overdue waiter returns", async () => {
  const sb = db({
    orders: [
      { id: "o1", company_id: "c", event_name: "Wedding", event_date: "2026-10-10", event_time: "12:00", status: "delivered", equipment_return_method: "waiter", waiter_duration_hours: 4 },
      { id: "o2", company_id: "c", event_name: "Party", event_date: "2026-10-10", event_time: "12:00", status: "delivered", equipment_return_method: "driver_same_day" },
      { id: "o3", company_id: "c", event_name: "Done", event_date: "2026-10-10", event_time: "12:00", status: "delivered", equipment_return_method: "waiter" },
    ],
    event_attendance: [
      { order_id: "o1", waiter_id: "w1", event_complete_at: "2026-10-10T17:00:00", equipment_returned_at: null },
      { order_id: "o3", waiter_id: "w2", event_complete_at: "2026-10-10T17:00:00", equipment_returned_at: "2026-10-10T18:00:00" },
    ],
    equipment_bookings: [
      { order_id: "o1", quantity: 40, returned_quantity: null, status: "booked" },
      { order_id: "o2", quantity: 10, returned_quantity: null, status: "booked" },
      { order_id: "o3", quantity: 10, returned_quantity: 10, status: "returned" },
    ],
  });
  const r = await runWaiterReturnReminders(sb, new Date("2026-10-11T07:00:00"));
  expect(r).toMatchObject({ considered: 2, overdue: 1, waiterPings: 1, adminPings: 1 });
  expect(pings[0]).toMatchObject({ recipient_id: "w1", related_entity_id: "o1", dedup: true });
  expect(broadcasts[0].message).toContain("40 items still out");
});
