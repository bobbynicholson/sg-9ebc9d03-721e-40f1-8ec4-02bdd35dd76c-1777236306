import {
  decideDriverClockIn,
  sumDriverShiftMilliseconds,
  type DriverClockShiftRow,
} from "@/lib/driverClock";

const shift = (overrides: Partial<DriverClockShiftRow>): DriverClockShiftRow => ({
  id: "shift-1",
  actual_start: null,
  actual_end: null,
  planned_start: null,
  status: "scheduled",
  ...overrides,
});

describe("driver clock split sessions", () => {
  it("creates a new session after a completed same-day shift", () => {
    const completed = shift({
      actual_start: "2026-07-09T08:00:00.000Z",
      actual_end: "2026-07-09T10:00:00.000Z",
      status: "completed",
    });

    expect(decideDriverClockIn([completed])).toEqual({ kind: "create_session" });
    // The completed row is immutable: the decision must never clear its end.
    expect(completed.actual_end).toBe("2026-07-09T10:00:00.000Z");
  });

  it("reuses an open row and stamps an unstarted roster row", () => {
    const open = shift({
      id: "open",
      actual_start: "2026-07-09T11:00:00.000Z",
      status: "active",
    });
    const rostered = shift({ id: "roster", planned_start: "08:00:00" });

    expect(decideDriverClockIn([open])).toEqual({ kind: "already_open", shift: open });
    expect(decideDriverClockIn([rostered])).toEqual({ kind: "start_rostered", shift: rostered });
  });

  it("does not resurrect a cancelled or missed roster row", () => {
    const cancelled = shift({ id: "cancelled", planned_start: "08:00:00", status: "cancelled" });
    const missed = shift({ id: "missed", planned_start: "09:00:00", status: "missed" });

    expect(decideDriverClockIn([cancelled])).toEqual({ kind: "create_session" });
    expect(decideDriverClockIn([missed])).toEqual({ kind: "create_session" });
  });

  it("totals two sessions without paying the clocked-out gap", () => {
    const sessions = [
      shift({
        id: "morning",
        actual_start: "2026-07-09T08:00:00.000Z",
        actual_end: "2026-07-09T10:00:00.000Z",
      }),
      shift({
        id: "afternoon",
        actual_start: "2026-07-09T11:00:00.000Z",
        actual_end: "2026-07-09T13:00:00.000Z",
      }),
    ];

    expect(sumDriverShiftMilliseconds(sessions)).toBe(4 * 60 * 60 * 1000);
    expect(sumDriverShiftMilliseconds(sessions) / 3_600_000).toBe(4);
    // Reopening the first row would have incorrectly returned five hours.
  });

  it("counts an open session only up to now and ignores invalid rows", () => {
    const now = Date.parse("2026-07-09T12:30:00.000Z");
    const sessions = [
      shift({ actual_start: "2026-07-09T12:00:00.000Z" }),
      shift({ id: "bad", actual_start: "not-a-date", actual_end: "2026-07-09T13:00:00.000Z" }),
    ];

    expect(sumDriverShiftMilliseconds(sessions, now)).toBe(30 * 60 * 1000);
  });
});
