/* eslint-disable @typescript-eslint/no-explicit-any */
// When a picked driver already has a nearby job, the pop-up offers the best
// free drivers so dispatch can assign one directly.
import { freeDriverAlternatives } from "@/components/admin/dispatch/ScheduleConflictConfirm";

const s = (id: string, total: number, busy = false): any => ({
  driver: { id, full_name: id }, score: { total, reasons: [] },
  scheduleConflict: busy ? { orderNumber: "ORD-1", eventTime: "18:30" } : undefined,
});

it("offers free drivers only, best score first, never the busy one picked", () => {
  const list = [s("ronan", 55, true), s("mike", 64), s("simon", 22), s("brandon", 48), s("other-busy", 90, true), s("ann", 30)];
  expect(freeDriverAlternatives(list, "ronan").map((x) => x.driver.id)).toEqual(["mike", "brandon", "ann"]);
});

it("is empty when nobody else is free", () => {
  expect(freeDriverAlternatives([s("ronan", 55, true), s("b", 40, true)], "ronan")).toEqual([]);
});
