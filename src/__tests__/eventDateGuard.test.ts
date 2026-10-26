import { daysUntilEventDate, hasEventDatePassed, shiftCalendarDate, tenantCalendarDate } from "@/lib/eventDateGuard";

describe("hasEventDatePassed", () => {
  it("uses the tenant calendar day and treats today as still upcoming", () => {
    // 00:30 on 26 October in Johannesburg, while UTC is still on the 25th.
    const now = new Date("2026-10-25T22:30:00.000Z");

    expect(hasEventDatePassed("2026-10-25", now, "Africa/Johannesburg")).toBe(true);
    expect(hasEventDatePassed("2026-10-26", now, "Africa/Johannesburg")).toBe(false);
  });

  it("leaves a missing event date unblocked", () => {
    expect(hasEventDatePassed(null, new Date("2026-10-26T12:00:00.000Z"))).toBe(false);
  });

  it("does calendar offsets and day distances without timezone rollover", () => {
    const now = new Date("2026-10-25T22:30:00.000Z");
    expect(tenantCalendarDate(now, "Africa/Johannesburg")).toBe("2026-10-26");
    expect(daysUntilEventDate("2026-10-27", now, "Africa/Johannesburg")).toBe(1);
    expect(shiftCalendarDate("2026-10-26", -1)).toBe("2026-10-25");
  });
});
