import { invoicePaymentTerms } from "@/lib/invoicePaymentTerms";
import { DEFAULT_PAYMENT_TERMS } from "@/lib/paymentTerms";

describe("invoice payment-term display", () => {
  it("uses the current company wording instead of an outdated invoice snapshot", () => {
    expect(invoicePaymentTerms("Old company wording", null, "Current company wording"))
      .toBe("Current company wording");
  });

  it("uses the invoice snapshot when no current company wording is available", () => {
    expect(invoicePaymentTerms("Balance due 48 hours before the event", null))
      .toBe("Balance due 48 hours before the event");
  });

  it("keeps the company default above a legacy linked-client term", () => {
    expect(invoicePaymentTerms("Old snapshot", 30, "Current company wording"))
      .toBe("Current company wording");
  });

  it("formats a linked customer's numeric terms for older invoices", () => {
    expect(invoicePaymentTerms(null, 14)).toBe("Payment due within 14 days");
    expect(invoicePaymentTerms(null, 1)).toBe("Payment due within 1 day");
    expect(invoicePaymentTerms(null, 0)).toBe("Payment due on receipt");
  });

  it("uses the company default when the client has no custom term", () => {
    expect(invoicePaymentTerms(null, null, "Custom company terms")).toBe("Custom company terms");
  });

  it("uses the standard deposit and balance terms when no term is configured", () => {
    expect(invoicePaymentTerms(null, null)).toBe(DEFAULT_PAYMENT_TERMS);
  });
});
