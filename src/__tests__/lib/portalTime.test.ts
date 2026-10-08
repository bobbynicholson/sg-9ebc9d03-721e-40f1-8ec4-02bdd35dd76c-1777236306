/**
 * One time zone + one time format for the whole portal (lib/portalTime).
 */
import {
  formatClock,
  getPortalTimeSettings,
  resetPortalTime,
  setPortalTimeSettings,
  tenantDateTime,
} from "@/lib/portalTime";

afterEach(() => resetPortalTime());

// 08:00 UTC = 10:00 in Johannesburg = 13:30 in Kolkata.
const MOMENT = new Date("2026-10-08T08:00:00Z");

describe("portal-wide time zone and format", () => {
  it("does nothing until a company zone or format is set", () => {
    const before = MOMENT.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    setPortalTimeSettings({ timeZone: null, timeFormat: null });
    expect(MOMENT.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })).toBe(before);
  });

  it("shows moments in the company zone, whatever the viewer's zone", () => {
    setPortalTimeSettings({ timeZone: "Africa/Johannesburg", timeFormat: "24h" });
    expect(MOMENT.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })).toBe("10:00");
    expect(MOMENT.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })).toContain("10:00");
    expect(new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(MOMENT)).toBe("10:00");
    setPortalTimeSettings({ timeZone: "Asia/Kolkata", timeFormat: "24h" });
    expect(MOMENT.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })).toBe("13:30");
  });

  it("uses the company's 12-hour or 24-hour choice", () => {
    setPortalTimeSettings({ timeZone: "Africa/Johannesburg", timeFormat: "12h" });
    expect(MOMENT.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })).toBe("10:00 AM");
    const afternoon = new Date("2026-10-08T12:30:00Z");
    expect(afternoon.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })).toBe("2:30 PM");
    setPortalTimeSettings({ timeZone: "Africa/Johannesburg", timeFormat: "24h" });
    expect(afternoon.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })).toBe("14:30");
  });

  it("keeps a zone / format the code asked for itself", () => {
    setPortalTimeSettings({ timeZone: "Africa/Johannesburg", timeFormat: "12h" });
    expect(MOMENT.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23" })).toBe("08:00");
  });

  it("never moves a calendar date to another day", () => {
    setPortalTimeSettings({ timeZone: "Pacific/Auckland", timeFormat: "24h" });
    const localDay = new Date(2026, 9, 10); // built in the browser
    expect(localDay.toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: undefined })).toContain("10");
    const utcDay = new Date("2026-10-10"); // "YYYY-MM-DD" -> UTC midnight
    expect(utcDay.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })).toContain("10");
    setPortalTimeSettings({ timeZone: "America/Los_Angeles", timeFormat: "24h" });
    expect(utcDay.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })).toContain("10");
    expect(localDay.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })).toContain("10");
  });

  it("moves a real moment shown as a date to the company's day", () => {
    setPortalTimeSettings({ timeZone: "Pacific/Auckland", timeFormat: "24h" });
    // 20:00 UTC on 9 Oct is already 10 Oct in Auckland.
    expect(new Date("2026-10-09T20:00:00Z").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })).toContain("10");
  });

  it("ignores an unknown zone", () => {
    setPortalTimeSettings({ timeZone: "Mars/Olympus", timeFormat: "nope" });
    expect(getPortalTimeSettings()).toEqual({ timeZone: null, timeFormat: null });
  });
});

describe("tenantDateTime: a stored date + clock time in company time", () => {
  it("is 13:00 in the company zone, including across daylight saving", () => {
    setPortalTimeSettings({ timeZone: "Africa/Johannesburg" });
    expect(tenantDateTime("2026-10-10", "13:00")!.toISOString()).toBe("2026-10-10T11:00:00.000Z");
    expect(tenantDateTime("2026-10-10", "13:00:00")!.toISOString()).toBe("2026-10-10T11:00:00.000Z");
    setPortalTimeSettings({ timeZone: "Europe/London" });
    expect(tenantDateTime("2026-07-01", "13:00")!.toISOString()).toBe("2026-07-01T12:00:00.000Z"); // BST
    expect(tenantDateTime("2026-12-01", "13:00")!.toISOString()).toBe("2026-12-01T13:00:00.000Z"); // GMT
    setPortalTimeSettings({ timeZone: "America/New_York" });
    expect(tenantDateTime("2026-11-01", "09:30")!.toISOString()).toBe("2026-11-01T14:30:00.000Z"); // day DST ends
  });

  it("uses the fallback time and copes with bad input", () => {
    setPortalTimeSettings({ timeZone: "Africa/Johannesburg" });
    expect(tenantDateTime("2026-10-10", null, "12:00")!.toISOString()).toBe("2026-10-10T10:00:00.000Z");
    expect(tenantDateTime("", "13:00")).toBeNull();
    expect(tenantDateTime("2026-10-10", "lunch")).toBeNull();
  });

  it("without a company zone matches the old new Date(`${date}T${time}`)", () => {
    expect(tenantDateTime("2026-10-10", "13:00")!.getTime()).toBe(new Date("2026-10-10T13:00").getTime());
  });

  it("shows back as the same clock time", () => {
    setPortalTimeSettings({ timeZone: "Africa/Johannesburg", timeFormat: "24h" });
    expect(tenantDateTime("2026-10-10", "13:00")!.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })).toBe("13:00");
  });
});

describe("formatClock: stored clock times in the company format", () => {
  it("24-hour by default", () => {
    expect(formatClock("14:30:00")).toBe("14:30");
    expect(formatClock("9:05")).toBe("09:05");
  });
  it("12-hour when chosen", () => {
    setPortalTimeSettings({ timeFormat: "12h" });
    expect(formatClock("14:30:00")).toBe("2:30 PM");
    expect(formatClock("00:15")).toBe("12:15 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
  });
  it("leaves anything else alone", () => {
    expect(formatClock("")).toBe("");
    expect(formatClock(null, "-")).toBe("-");
    expect(formatClock("TBC")).toBe("TBC");
  });
});
