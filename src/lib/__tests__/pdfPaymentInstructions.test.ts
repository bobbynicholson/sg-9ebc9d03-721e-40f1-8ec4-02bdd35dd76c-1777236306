jest.mock("@/lib/paymentService", () => ({
  getPublicPaymentAvailability: jest.fn(),
}));

import { buildPdfPaymentInstructions } from "@/lib/pdfPaymentInstructions";
import { getPublicPaymentAvailability } from "@/lib/paymentService";

describe("PDF payment instructions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps bank transfer details on quotes and invoices when PayFast is available", async () => {
    (getPublicPaymentAvailability as jest.Mock).mockResolvedValue({
      provider: "payfast",
      online_available: true,
    });

    const result = await buildPdfPaymentInstructions({
      company: {
        id: "company-1",
        company_name: "Fixture Caterer",
        bank_name: "Fixture Bank",
        bank_account_number: "123456789",
      },
      paymentUrl: "https://example.test/pay/invoice",
      reference: "Q-100",
    });

    expect(result).toMatchObject({
      online_provider: "payfast",
      payment_url: "https://example.test/pay/invoice",
      eft: {
        bank_name: "Fixture Bank",
        account_number: "123456789",
        reference: "Q-100",
      },
    });
  });

  it("still returns a payment section when no bank account is configured", async () => {
    (getPublicPaymentAvailability as jest.Mock).mockResolvedValue({
      provider: null,
      online_available: false,
    });

    await expect(buildPdfPaymentInstructions({
      company: { id: "company-2", company_name: "Fixture Caterer" },
    })).resolves.toEqual({
      online_provider: null,
      payment_url: null,
      eft: null,
      reference: null,
      reference_hint: null,
    });
  });
});
