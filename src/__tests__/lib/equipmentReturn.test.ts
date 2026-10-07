import { resolveEquipmentReturn, isDriverCollection, equipmentReturnLine } from "@/lib/equipmentReturn";

describe("resolveEquipmentReturn", () => {
  it("uses the saved choice", () => {
    expect(resolveEquipmentReturn({ equipment_return_method: "waiter" })).toBe("waiter");
    expect(resolveEquipmentReturn({ equipment_return_method: "driver_next_day", requires_waiter: true })).toBe("driver_next_day");
    expect(resolveEquipmentReturn({ equipment_return_method: "none" })).toBe("none");
  });

  it("a waiter on the job no longer overrides an explicit driver collection", () => {
    const m = resolveEquipmentReturn({ equipment_return_method: "driver_same_day", requires_waiter: true });
    expect(isDriverCollection(m)).toBe(true);
  });

  it("keeps the old guess when nothing was chosen", () => {
    expect(resolveEquipmentReturn({ requires_waiter: true })).toBe("waiter");
    expect(resolveEquipmentReturn({ waiter_service_required: true })).toBe("waiter");
    expect(resolveEquipmentReturn({ collection_next_day: true })).toBe("driver_next_day");
    expect(resolveEquipmentReturn({})).toBe("driver_same_day");
    expect(resolveEquipmentReturn(null)).toBe("driver_same_day");
  });

  it("maps values written by earlier builds", () => {
    expect(resolveEquipmentReturn({ equipment_return_method: "deliver_and_collect" })).toBe("driver_same_day");
    expect(resolveEquipmentReturn({ equipment_return_method: "collect", collection_next_day: true })).toBe("driver_next_day");
    expect(resolveEquipmentReturn({ equipment_return_method: "client_keeps" })).toBe("none");
  });

  it("builds the responsibility line", () => {
    expect(equipmentReturnLine({ equipment_return_method: "waiter" })).toBe("Equipment return: Waiter (brings it back after service)");
  });
});

import { collectionScheduledFor, computeReturnStatus, countsToDamages } from "@/lib/equipmentReturn";

describe("collectionScheduledFor", () => {
  it("next day is 09:00 the morning after", () => {
    const d = collectionScheduledFor("2026-10-10", "12:00", "driver_next_day");
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([11, 9, 0]);
  });
  it("same day is event start + 5h, or 23:00 without a start time", () => {
    expect(collectionScheduledFor("2026-10-10", "12:30", "driver_same_day").getHours()).toBe(17);
    expect(collectionScheduledFor("2026-10-10", null, "driver_same_day").getHours()).toBe(23);
  });
});

describe("countsToDamages (count what came back)", () => {
  const line = { equipmentId: "chairs", booked: 50, unitCost: 120, back: "50", damaged: "", damageType: "damaged" as const, note: "" };

  it("nothing recorded when everything is counted back", () => {
    expect(countsToDamages([line])).toEqual([]);
  });

  it("anything not counted back is recorded as missing automatically", () => {
    expect(countsToDamages([{ ...line, back: "47" }])).toEqual([
      expect.objectContaining({ equipmentId: "chairs", quantityDamaged: 3, damageType: "lost" }),
    ]);
  });

  it("damaged is separate from missing and capped at what came back", () => {
    const r = countsToDamages([{ ...line, back: "48", damaged: "60", damageType: "broken", note: "legs snapped" }]);
    expect(r).toEqual([
      expect.objectContaining({ quantityDamaged: 2, damageType: "lost", description: "Missing on return: legs snapped" }),
      expect.objectContaining({ quantityDamaged: 48, damageType: "broken", description: "legs snapped" }),
    ]);
  });

  it("ignores nonsense input", () => {
    expect(countsToDamages([{ ...line, back: "abc" }])[0]).toMatchObject({ quantityDamaged: 50, damageType: "lost" });
    expect(countsToDamages([{ ...line, back: "70" }])).toEqual([]);
  });
});

describe("computeReturnStatus", () => {
  const start = new Date("2026-10-10T12:00:00");
  const out = [{ quantity: 50, returned_quantity: null, status: "booked" }];

  it("waiter return becomes overdue after the event + grace", () => {
    const att = [{ event_complete_at: "2026-10-10T18:00:00", equipment_returned_at: null }];
    expect(computeReturnStatus({ method: "waiter", now: new Date("2026-10-10T19:00:00"), eventStart: start, attendance: att, bookings: out }).state).toBe("in_progress");
    expect(computeReturnStatus({ method: "waiter", now: new Date("2026-10-10T22:00:00"), eventStart: start, attendance: att, bookings: out }).state).toBe("overdue");
  });

  it("waiter with no taps is overdue after the booked service window + grace", () => {
    expect(computeReturnStatus({ method: "waiter", now: new Date("2026-10-10T20:00:00"), eventStart: start, waiterHours: 4, attendance: [], bookings: out }).state).toBe("overdue");
    expect(computeReturnStatus({ method: "waiter", now: new Date("2026-10-10T18:00:00"), eventStart: start, waiterHours: 4, attendance: [], bookings: out }).state).toBe("waiting");
  });

  it("driver collection: booked, on the way, overdue", () => {
    const c = { status: "assigned", scheduled_for: "2026-10-11T09:00:00" };
    expect(computeReturnStatus({ method: "driver_next_day", now: new Date("2026-10-11T08:00:00"), eventStart: start, collection: c, bookings: out }).state).toBe("waiting");
    expect(computeReturnStatus({ method: "driver_next_day", now: new Date("2026-10-11T10:00:00"), eventStart: start, collection: { ...c, status: "en_route" }, bookings: out }).state).toBe("in_progress");
    expect(computeReturnStatus({ method: "driver_next_day", now: new Date("2026-10-11T13:00:00"), eventStart: start, collection: c, bookings: out }).state).toBe("overdue");
  });

  it("counts what came back and what is missing once returned", () => {
    const s = computeReturnStatus({
      method: "waiter", now: new Date(), eventStart: start,
      bookings: [{ quantity: 50, returned_quantity: 48, status: "returned" }, { quantity: 2, returned_quantity: 2, status: "returned" }],
    });
    expect(s).toMatchObject({ state: "returned", booked: 52, back: 50, missing: 2 });
  });

  it("client returns / nothing booked are not tracked", () => {
    expect(computeReturnStatus({ method: "none", now: new Date(), eventStart: start, bookings: out }).state).toBe("not_applicable");
    expect(computeReturnStatus({ method: "waiter", now: new Date(), eventStart: start, bookings: [] }).state).toBe("not_applicable");
  });
});
