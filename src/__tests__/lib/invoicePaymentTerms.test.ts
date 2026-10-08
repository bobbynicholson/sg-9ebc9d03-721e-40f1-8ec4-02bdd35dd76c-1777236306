import { invoicePaymentTerms } from "@/lib/invoicePaymentTerms";

describe("invoice payment-term display", () => {
  it("preserves the terms captured when an invoice was issued", () => {
    expect(invoicePaymentTerms("Balance due 48 hours before the event", 30))
      .toBe("Balance due 48 hours before the event");
  });

  it("formats a linked customer's numeric terms for older invoices", () => {
    expect(invoicePaymentTerms(null, 14)).toBe("Payment due within 14 days");
    expect(invoicePaymentTerms(null, 1)).toBe("Payment due within 1 day");
    expect(invoicePaymentTerms(null, 0)).toBe("Payment due on receipt");
  });

  it("uses the platform-safe 30-day fallback when no term is available", () => {
    expect(invoicePaymentTerms(null, null)).toBe("Payment due within 30 days");
  });
});
