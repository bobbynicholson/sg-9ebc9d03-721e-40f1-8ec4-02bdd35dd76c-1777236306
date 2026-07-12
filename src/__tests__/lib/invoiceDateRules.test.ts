import {
  calculateInvoiceDueDate,
  parseInvoiceCalendarDate,
} from "@/lib/invoiceDateRules";

function ymd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

describe("invoice generation due-date rule", () => {
  const invoiceDate = new Date(2026, 6, 7, 16, 45);

  it("makes a same-day function due on the invoice day", () => {
    const due = calculateInvoiceDueDate({
      invoiceDate,
      termDays: 14,
      eventDate: "2026-07-07",
    });
    expect(ymd(due)).toBe("2026-07-07");
  });

  it("never backdates a past-event invoice", () => {
    const due = calculateInvoiceDueDate({
      invoiceDate,
      termDays: 30,
      eventDate: "2026-07-01",
    });
    expect(ymd(due)).toBe("2026-07-07");
  });

  it("prefers the day before a future event over longer terms", () => {
    const due = calculateInvoiceDueDate({
      invoiceDate,
      termDays: 30,
      eventDate: "2026-07-20",
    });
    expect(ymd(due)).toBe("2026-07-19");
  });

  it("keeps an earlier term-based due date", () => {
    const due = calculateInvoiceDueDate({
      invoiceDate,
      termDays: 5,
      eventDate: "2026-07-20",
    });
    expect(ymd(due)).toBe("2026-07-12");
  });

  it("uses the term when no event date exists", () => {
    const due = calculateInvoiceDueDate({
      invoiceDate,
      termDays: 14,
      eventDate: null,
    });
    expect(ymd(due)).toBe("2026-07-21");
  });

  it("parses date-only values as the written local calendar date", () => {
    const parsed = parseInvoiceCalendarDate("2026-07-07");
    expect(parsed && ymd(parsed)).toBe("2026-07-07");
  });
});
