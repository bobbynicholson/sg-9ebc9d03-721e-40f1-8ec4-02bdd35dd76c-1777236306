import { configuredPaymentTerms, DEFAULT_PAYMENT_TERMS } from "@/lib/paymentTerms";

describe("company payment terms", () => {
  it("loads configured wording from company settings", () => {
    expect(configuredPaymentTerms({ paymentTermsText: "Deposit first. Balance before event." }))
      .toBe("Deposit first. Balance before event.");
  });

  it("accepts settings stored as serialized JSON", () => {
    expect(configuredPaymentTerms(JSON.stringify({ paymentTermsText: "Custom wording" })))
      .toBe("Custom wording");
  });

  it("uses the shared default for missing, blank, or invalid settings", () => {
    expect(configuredPaymentTerms(null)).toBe(DEFAULT_PAYMENT_TERMS);
    expect(configuredPaymentTerms({ paymentTermsText: "  " })).toBe(DEFAULT_PAYMENT_TERMS);
    expect(configuredPaymentTerms("not-json")).toBe(DEFAULT_PAYMENT_TERMS);
  });
});