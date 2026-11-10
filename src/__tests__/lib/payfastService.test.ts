import { fetchPayFastHistoryPage, generatePayFastPaymentForm } from "@/lib/payfastService";

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
  it.each([undefined, "", "   "])("omits an absent optional buyer email (%j)", (emailAddress) => {
    const html = generatePayFastPaymentForm({ ...BASE_INPUT, emailAddress });
    expect(html).not.toContain('name="email_address"');
    expect(html).toContain('name="amount" value="4900.00"');
    expect(html).toContain('name="custom_str4" value="invoice-id"');
  });
});

describe("fetchPayFastHistoryPage", () => {
  const range = { from: "2026-11-09", to: "2026-11-09", offset: 0, limit: 100 };
  const originalFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");

  const mockFetch = (response: Partial<Response>) => {
    const fetchMock = jest.fn().mockResolvedValue(response);
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    return fetchMock;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetchDescriptor) {
      Object.defineProperty(globalThis, "fetch", originalFetchDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "fetch");
    }
  });

  it("parses PayFast's raw CSV history response", async () => {
    const csv = [
      "Date,Type,Sign,ID,Merchant Reference,Amount,Currency,Status,custom_str1,custom_str2,custom_str3,custom_str4,custom_str5",
      '2026-11-09,FUNDS_RECEIVED,CREDIT,PF-42,attempt-42,2160.50,ZAR,COMPLETE,invoice-42,deposit,company-42,invoice-42,attempt-42',
      '2026-11-09,FUNDS_SENT,DEBIT,PF-43,refund-43,20.00,ZAR,COMPLETE,,,,,',
    ].join("\n");
    mockFetch({
      ok: true,
      text: async () => csv,
    });

    await expect(fetchPayFastHistoryPage({ merchantId: "merchant-42" }, range)).resolves.toEqual({
      transactions: [{
        pf_payment_id: "PF-42",
        m_payment_id: "attempt-42",
        amount_gross: "2160.50",
        currency: "ZAR",
        payment_status: "COMPLETE",
        custom_str1: "invoice-42",
        custom_str2: "deposit",
        custom_str3: "company-42",
        custom_str4: "invoice-42",
        custom_str5: "attempt-42",
      }],
      rawCount: 2,
    });
  });

  it("continues to parse JSON-wrapped history responses", async () => {
    const transactions = [{
      pf_payment_id: "PF-44",
      m_payment_id: "attempt-44",
      amount_gross: "125.00",
      currency: "ZAR",
      status: "COMPLETE",
      custom_str1: "invoice-44",
      custom_str2: "invoice",
      custom_str3: "company-44",
      custom_str4: "invoice-44",
      custom_str5: "attempt-44",
    }];
    mockFetch({
      ok: true,
      text: async () => JSON.stringify({ status: "success", data: { response: transactions } }),
    });

    await expect(fetchPayFastHistoryPage({ merchantId: "merchant-44" }, range)).resolves.toMatchObject({
      transactions: [{ pf_payment_id: "PF-44", m_payment_id: "attempt-44", payment_status: "COMPLETE" }],
      rawCount: 1,
    });
  });
});
