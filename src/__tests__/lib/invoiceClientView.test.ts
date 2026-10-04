import {
  getInitialInvoicePaymentAmount,
  getInvoiceBalanceAfterFirstPayment,
  getInvoiceDueState,
  getInvoiceHeaderIdentifiers,
  isInvoiceFullPaymentDue,
  parseInvoiceCalendarDate,
  resolveInvoiceEventDate,
} from "@/lib/invoiceClientView";

describe("invoice client-view calendar rules", () => {
  const lateOnEventDay = new Date(2026, 6, 7, 23, 59, 59);

  it("keeps a same-day deadline due today for the entire calendar day", () => {
    expect(getInvoiceDueState("2026-07-07", lateOnEventDay)).toEqual({
      daysToDue: 0,
      isOverdue: false,
      label: "Due today",
    });
  });

  it("uses calendar-day differences for tomorrow and overdue labels", () => {
    expect(getInvoiceDueState("2026-07-08", lateOnEventDay).label).toBe("Due tomorrow");
    expect(getInvoiceDueState("2026-07-06", lateOnEventDay)).toEqual({
      daysToDue: -1,
      isOverdue: true,
      label: "Overdue by 1 day",
    });
  });

  it("parses yyyy-MM-dd without UTC shifting the business date", () => {
    const parsed = parseInvoiceCalendarDate("2026-07-07");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(6);
    expect(parsed?.getDate()).toBe(7);
  });
});

describe("same-day invoice payment presentation", () => {
  const eventDay = new Date(2026, 6, 7, 12);

  it("treats same-day and past events as full-payment due", () => {
    expect(isInvoiceFullPaymentDue("2026-07-07", eventDay)).toBe(true);
    expect(isInvoiceFullPaymentDue("2026-07-06", eventDay)).toBe(true);
    expect(isInvoiceFullPaymentDue("2026-07-08", eventDay)).toBe(false);
    expect(isInvoiceFullPaymentDue(null, eventDay)).toBe(false);
  });

  it("prefills the full outstanding balance instead of a 50% deposit", () => {
    expect(getInitialInvoicePaymentAmount({
      totalAmount: 5_833.86,
      balanceDue: 5_833.86,
      depositPercent: 50,
      eventDate: "2026-07-07",
      now: eventDay,
    })).toBe(5_833.86);

    expect(getInitialInvoicePaymentAmount({
      totalAmount: 5_833.86,
      balanceDue: 5_833.86,
      depositPercent: 50,
      eventDate: "2026-07-08",
      now: eventDay,
    })).toBe(2_916.93);
  });

  it("requests only the unpaid part of the agreed first payment", () => {
    expect(getInitialInvoicePaymentAmount({
      totalAmount: 2_835.94,
      balanceDue: 2_833.94,
      amountPaid: 2,
      depositPercent: 50,
      firstPaymentAmount: 5,
      eventDate: "2026-10-31",
      now: new Date(2026, 9, 4),
    })).toBe(3);

    expect(getInitialInvoicePaymentAmount({
      totalAmount: 2_835.94,
      balanceDue: 2_830.94,
      amountPaid: 5,
      depositPercent: 50,
      firstPaymentAmount: 5,
      eventDate: "2026-10-31",
      now: new Date(2026, 9, 4),
    })).toBe(2_830.94);
  });

  it("shows the future balance after the R5 first payment on the order page", () => {
    expect(getInvoiceBalanceAfterFirstPayment({
      totalAmount: 2_835.94,
      balanceDue: 2_835.94,
      amountPaid: 0,
      firstPaymentAmount: 5,
      eventDate: "2026-10-31",
      now: new Date(2026, 9, 4),
    })).toBe(2_830.94);
  });

  it("supports both current and legacy event-date snapshot keys", () => {
    expect(resolveInvoiceEventDate({ eventDate: "2026-07-07" })).toBe("2026-07-07");
    expect(resolveInvoiceEventDate({ event_date: "2026-07-07" })).toBe("2026-07-07");
    expect(resolveInvoiceEventDate({}, "2026-07-07")).toBe("2026-07-07");
  });
});

describe("invoice company identifiers", () => {
  it("shows the company registration number before the VAT number", () => {
    expect(getInvoiceHeaderIdentifiers({
      registration_number: "2022/427271/07",
      vat_registered: true,
      vat_number: "4250305390",
    })).toEqual([
      { key: "registration", label: "Reg No", value: "2022/427271/07" },
      { key: "vat", label: "VAT Reg No", value: "4250305390" },
    ]);
  });
});
