/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// A dispatcher can put one driver on two nearby jobs after answering
// "Assign anyway". Without that answer the overlap is still refused, and a
// schedule that could not be read is always refused.
const updates: any[] = [];

function query(table: string) {
  const api: any = {
    select: () => api, eq: () => api, is: () => api, in: () => api, or: () => api, neq: () => api,
    update: (values: any) => { updates.push({ table, values }); return api; },
    insert: async () => ({ error: null }),
    maybeSingle: async () => ({
      data: table === "orders" ? { service_sittings: [], assigned_driver_id: null, event_date: "2026-10-30", event_time: "18:30:00" } : null,
      error: null,
    }),
    // The order update matches no row: enough to prove the gate let it through.
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return api;
}

jest.mock("@/integrations/supabase/client", () => ({ supabase: { from: query } }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => ({ from: query }) }));
jest.mock("@/services/notificationService", () => ({ notificationService: {} }));
jest.mock("@/services/shiftService", () => ({ shiftService: {} }));

import { dispatchService } from "@/services/dispatchService";

const base = { companyId: "co-1", orderId: "order-2", driverId: "driver-1", performedBy: "u1" };
const overlap = { ok: false, conflictOrderId: "order-1", conflictOrderNumber: "ORD-1", reason: "This driver is already assigned to order ORD-1 at 18:30." };

beforeEach(() => { updates.length = 0; jest.restoreAllMocks(); });

describe("assigning a driver who already has a nearby job", () => {
  it("is refused when the dispatcher has not confirmed it", async () => {
    jest.spyOn(dispatchService, "checkDoubleBooking").mockResolvedValue(overlap as any);
    const r = await dispatchService.assignDriverWithGate(base);
    expect(r).toEqual({ ok: false, reason: overlap.reason });
    expect(updates.filter((u) => u.table === "orders")).toHaveLength(0);
  });

  it("goes ahead after 'Assign anyway'", async () => {
    jest.spyOn(dispatchService, "checkDoubleBooking").mockResolvedValue(overlap as any);
    await dispatchService.assignDriverWithGate({ ...base, allowScheduleConflict: true });
    expect(updates).toContainEqual(expect.objectContaining({ table: "orders", values: expect.objectContaining({ assigned_driver_id: "driver-1" }) }));
  });

  it("is still refused when the driver's schedule could not be read", async () => {
    const unreadable = { ok: false, reason: "We could not verify this driver's schedule." };
    jest.spyOn(dispatchService, "checkDoubleBooking").mockResolvedValue(unreadable as any);
    const r = await dispatchService.assignDriverWithGate({ ...base, allowScheduleConflict: true });
    expect(r).toEqual({ ok: false, reason: unreadable.reason });
    expect(updates.filter((u) => u.table === "orders")).toHaveLength(0);
  });
});
