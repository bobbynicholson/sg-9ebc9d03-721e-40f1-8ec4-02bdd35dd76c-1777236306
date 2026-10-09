import { buildQuotePdfDataFromRow } from "@/services/pdf/quotePdfData";
import { DEFAULT_PAYMENT_TERMS } from "@/lib/paymentTerms";

describe("quote PDF payment terms", () => {
  it("uses the configured company wording", () => {
    const data = buildQuotePdfDataFromRow({
      quote_number: "QUO-1",
      company: {
        dispatch_settings: {
          paymentTermsText: "40% deposit. Balance due 3 days before the event.",
        },
      },
    });

    expect(data.payment_terms).toBe("40% deposit. Balance due 3 days before the event.");
  });

  it("uses the standard deposit wording when no company terms are configured", () => {
    expect(buildQuotePdfDataFromRow({ quote_number: "QUO-2" }).payment_terms)
      .toBe(DEFAULT_PAYMENT_TERMS);
  });

  it("preserves a client's numeric terms when building a quote PDF", () => {
    const data = buildQuotePdfDataFromRow({
      quote_number: "QUO-3",
      client: { payment_terms: 14 },
      company: { dispatch_settings: { paymentTermsText: "Company default" } },
    });

    expect(data.payment_terms).toBe("Payment due within 14 days");
  });
});
