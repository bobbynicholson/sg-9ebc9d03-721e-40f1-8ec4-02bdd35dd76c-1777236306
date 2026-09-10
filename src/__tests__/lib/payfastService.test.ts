import { generatePayFastPaymentForm } from "@/lib/payfastService";

const BASE_INPUT = {
  merchantId: "10000100",
  merchantKey: "46f0cd694581a",
  passphrase: "jt7NOE43FZPn",
  testMode: true,
  amount: 4_900,
  itemName: "Order ORD-001 - Deposit payment",
  returnUrl: "https://cateringms.com/pay/i/test/success",
  cancelUrl: "https://cateringms.com/pay/i/test?cancelled=1",
  notifyUrl: "https://cateringms.com/api/webhooks/payment-confirmation",
  nameFirst: "Test",
  nameLast: "Buyer",
  emailAddress: "buyer@example.com",
  customStr1: "order-id",
  customStr2: "deposit",
  customStr3: "company-id",
  customStr4: "invoice-id",
};

describe("generatePayFastPaymentForm", () => {
  it("omits the signature for PayFast's shared sandbox account", () => {
    const html = generatePayFastPaymentForm(BASE_INPUT);

    expect(html).toContain('action="https://sandbox.payfast.co.za/eng/process"');
    expect(html).not.toContain('name="signature"');
  });

  it("keeps tenant-owned sandbox payments signed", () => {
    const html = generatePayFastPaymentForm({
      ...BASE_INPUT,
      merchantId: "10004002",
      merchantKey: "q1cd2rdny4a53",
      passphrase: "payfast",
    });

    expect(html).toMatch(/name="signature" value="[a-f0-9]{32}"/);
  });

  it("never applies the unsigned exception to live payments", () => {
    const html = generatePayFastPaymentForm({
      ...BASE_INPUT,
      testMode: false,
    });

    expect(html).toContain('action="https://www.payfast.co.za/eng/process"');
    expect(html).toMatch(/name="signature" value="[a-f0-9]{32}"/);
  });
});
