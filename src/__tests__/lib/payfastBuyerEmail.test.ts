/** @jest-environment node */
import { createPaymentSession } from "@/lib/paymentService";
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/services/paymentGatewayService", () => ({ paymentGatewayService: {} }));
jest.mock("@/lib/yocoService", () => ({ createYocoCheckout: jest.fn() }));
jest.mock("@/lib/stripeService", () => ({ createStripeCheckout: jest.fn() }));

test("tenant PayFast checkout lets the buyer enter email while preserving signed financial correlation", async () => {
  const result = await createPaymentSession({
    companyId: "company-1", orderId: "order-1", type: "deposit", amount: 5,
    currency: "ZAR", description: "Deposit", successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel", notifyUrl: "https://example.com/notify",
    customer: { email: "company@example.com", firstName: "Buyer", lastName: "Name" },
    extraMetadata: { invoiceId: "invoice-1", paymentAttemptId: "attempt-1" },
  }, { gateway: { company_id: "company-1", provider: "payfast", is_test: false },
    credentials: { merchantId: "merchant", merchantKey: "key", passphrase: "secret" } } as any);
  expect(result).toMatchObject({ ok: true, provider: "payfast", isHtmlForm: true, sessionId: "attempt-1" });
  expect(result.paymentUrl).not.toContain('name="email_address"');
  expect(result.paymentUrl).toContain('name="name_first" value="Buyer"');
  expect(result.paymentUrl).toContain('name="amount" value="5.00"');
  expect(result.paymentUrl).toContain('name="m_payment_id" value="attempt-1"');
  expect(result.paymentUrl).toContain('name="custom_str3" value="company-1"');
  expect(result.paymentUrl).toContain('name="custom_str4" value="invoice-1"');
  expect(result.paymentUrl).toMatch(/name="signature" value="[a-f0-9]{32}"/);
  expect(result.paymentUrl).not.toContain("secret");
});
