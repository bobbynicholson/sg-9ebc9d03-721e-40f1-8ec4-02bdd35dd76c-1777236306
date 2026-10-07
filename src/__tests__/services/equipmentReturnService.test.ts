/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
const returned: Array<{ id: string; qty: number }> = [];
const damages: any[] = [];
const broadcasts: any[] = [];
let bookings: any[] = [];

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        update: () => api,
        maybeSingle: async () => ({ data: table === "profiles" ? { full_name: "Thabo" } : { company_id: "co1", order_number: "ORD-1" }, error: null }),
        then: (resolve: any) => resolve({ data: table === "equipment_bookings" ? bookings : [], error: null }),
      };
      return api;
    },
  },
}));
jest.mock("@/services/equipmentService", () => ({
  equipmentService: { returnEquipment: async (id: string, qty: number) => { returned.push({ id, qty }); } },
}));
jest.mock("@/services/equipmentTrackingService", () => ({
  equipmentTrackingService: { reportDamage: async (p: any) => { damages.push(p); } },
}));
jest.mock("@/services/notificationService", () => ({
  notificationService: { broadcastNotification: async (p: any) => { broadcasts.push(p); return 1; } },
}));

import { equipmentReturnService, missingUnitsByEquipment } from "@/services/equipmentReturnService";

beforeEach(() => { returned.length = 0; damages.length = 0; broadcasts.length = 0; });

test("lost / stolen units are not counted back into stock; damaged ones are", () => {
  const m = missingUnitsByEquipment([
    { equipmentId: "chairs", quantityDamaged: 3, damageType: "lost", unitCost: 100 },
    { equipmentId: "chairs", quantityDamaged: 1, damageType: "broken", unitCost: 100 },
    { equipmentId: "urn", quantityDamaged: 1, damageType: "stolen", unitCost: 900 },
  ]);
  expect(m.get("chairs")).toBe(3);
  expect(m.get("urn")).toBe(1);
});

test("returns every open booking, short by missing units, records damage and tells cleaning", async () => {
  bookings = [
    { id: "b1", status: "booked", equipment_id: "chairs", quantity: 50 },
    { id: "b2", status: "booked", equipment_id: "urn", quantity: 2 },
    { id: "b3", status: "returned", equipment_id: "plates", quantity: 100 },
  ];
  const r = await equipmentReturnService.returnOrderEquipment({
    orderId: "o1",
    responsibleUserId: "waiter-1",
    damages: [
      { equipmentId: "chairs", quantityDamaged: 2, damageType: "lost", unitCost: 100 },
      { equipmentId: "urn", quantityDamaged: 1, damageType: "damaged", unitCost: 900 },
    ],
  });
  expect(returned).toEqual([{ id: "b1", qty: 48 }, { id: "b2", qty: 2 }]);
  expect(damages.map((d) => [d.equipmentId, d.responsibleUserId, d.damageStage])).toEqual([
    ["chairs", "waiter-1", "return"],
    ["urn", "waiter-1", "return"],
  ]);
  expect(broadcasts[0]).toMatchObject({ type: "equipment_returned", companyId: "co1" });
  // Office summary: who brought it back and the count; high priority when
  // something is missing or damaged; the shared admin audience.
  expect(broadcasts[1]).toMatchObject({ type: "equipment_returned_with_issues", priority: "high" });
  expect(broadcasts[1].message).toBe("Thabo brought the equipment back: 50 of 52 counted in, 2 missing, 1 damaged.");
  expect(broadcasts[1].targetRoles).toEqual(["company_admin", "owner", "admin", "region_admin"]);
  expect(r).toEqual({ bookingsReturned: 2, damagesRecorded: 2, cleaningNotified: true, booked: 52, back: 50, missing: 2, damaged: 1 });
});

test("nothing wrong: everything returned in full, no damage rows", async () => {
  bookings = [{ id: "b1", status: "booked", equipment_id: "chairs", quantity: 10 }];
  await equipmentReturnService.returnOrderEquipment({ orderId: "o1", responsibleUserId: "d1" });
  expect(returned).toEqual([{ id: "b1", qty: 10 }]);
  expect(damages).toEqual([]);
});
