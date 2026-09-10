import {
  clipInterval,
  intervalsOverlap,
  slidingWindow,
  unionHours,
  unionIntervals,
} from "./workforceIntervals";

// Deliberately use the same local wall-clock convention as dispatch's
// event_date + event_time parser.
const t = (minutes: number) => `2026-09-05T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00.000`;

describe("workforce interval union", () => {
  it("merges nested, touching, and overlapping order windows once", () => {
    const result = unionIntervals([
      { start: t(0), end: t(120) },
      { start: t(30), end: t(60) },
      { start: t(120), end: t(180) },
      { start: t(150), end: t(240) },
    ]);
    expect(result).toEqual([{ start: Date.parse(t(0)), end: Date.parse(t(240)) }]);
    expect(unionHours([
      { start: t(0), end: t(120) },
      { start: t(30), end: t(60) },
      { start: t(120), end: t(180) },
    ])).toBe(3);
  });

  it("does not count a simultaneous second order twice", () => {
    expect(unionHours([
      { start: t(600), end: t(720) },
      { start: t(630), end: t(690) },
    ])).toBe(2);
  });

  it("clips a job that crosses a report window", () => {
    const clipped = clipInterval(
      { start: "2026-09-04T23:00:00.000Z", end: "2026-09-05T02:00:00.000Z" },
      { start: "2026-09-05T00:00:00.000Z", end: "2026-09-06T00:00:00.000Z" },
    );
    expect(clipped).toEqual({ start: Date.parse("2026-09-05T00:00:00.000Z"), end: Date.parse("2026-09-05T02:00:00.000Z") });
  });

  it("uses half-open overlap semantics for a sliding dispatch window", () => {
    const window = slidingWindow("2026-09-05", "12:00", 60)!;
    expect(intervalsOverlap(window, { start: t(780), end: t(840) })).toBe(false);
    expect(intervalsOverlap(window, { start: t(719), end: t(740) })).toBe(true);
  });
});
