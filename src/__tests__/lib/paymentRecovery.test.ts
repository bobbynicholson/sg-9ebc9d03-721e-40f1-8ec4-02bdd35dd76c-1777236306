/** @jest-environment node */
import { fetchPayFastHistoryPage, generatePayFastPaymentForm, pfUrlEncode } from "@/lib/payfastService";
import { recoverPayFastTransaction } from "@/lib/paymentRecovery";
import { settleTenantGatewayPayment } from "@/lib/tenantGatewaySettlement";
jest.mock("@/lib/tenantGatewaySettlement", () => ({ settleTenantGatewayPayment: jest.fn(), applyVerifiedPayment: jest.fn() }));
const gateway = { id: "gateway-1", company_id: "company-1", is_test: false, merchantId: "merchant-1" };
const attemptId = "00000000-0000-0000-0000-000000000001";
const attempt = { id: attemptId, company_id: gateway.company_id, provider: "payfast", invoice_id: "invoice-1",
  order_id: "order-1", payment_type: "deposit", amount: 100, currency: "ZAR",
  metadata: { gatewayId: gateway.id, merchantId: gateway.merchantId, gatewayIsTest: "false" } };
const transaction = { pf_payment_id: "pf-1", m_payment_id: attemptId, custom_str5: attemptId,
  amount_gross: "100.00", payment_status: "COMPLETE", currency: "ZAR" };
const adminFor = (savedAttempt: unknown) => {
  const chain = { select: jest.fn(), eq: jest.fn(), or: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({ data: savedAttempt, error: null }) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.or.mockReturnValue(chain);
  return { from: jest.fn().mockReturnValue(chain) };
};
const fetchMock = jest.fn();
beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock; });
const range = { from: "2026-10-01", to: "2026-10-03", offset: 100, limit: 100 };
test("history errors are surfaced instead of reporting a successful empty scan", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 401 });
  await expect(fetchPayFastHistoryPage({ merchantId: "123" }, range)).rejects.toThrow("HTTP 401");
  fetchMock.mockRejectedValueOnce(new Error("network down"));
  await expect(fetchPayFastHistoryPage({ merchantId: "123" }, range)).rejects.toThrow("network down");
});
test("unexpected history body and JSON failure are not empty successful results", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { wrong: true } }) });
  await expect(fetchPayFastHistoryPage({ merchantId: "123" }, range)).rejects.toThrow("Unexpected");
  fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
  await expect(fetchPayFastHistoryPage({ merchantId: "123" }, range)).rejects.toThrow("invalid JSON");
});
test("CSV history retains checkout ID, major-unit amount and raw page count including unrelated rows", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ response:
    '\uFEFFType,Sign,Gross,Currency,"M Payment ID","PF Payment ID","custom str5",Description\r\n' +
    `FUNDS_RECEIVED,CREDIT,100.00,ZAR,${attemptId},pf-1,${attemptId},"Dinner, event"\r\n` +
    'PAYOUT,DEBIT,-100.00,ZAR,,payout-1,,\r\n' }) });
  const result = await fetchPayFastHistoryPage({ merchantId: "123", isTest: true }, range);
  expect(result.rawCount).toBe(2); expect(result.transactions).toHaveLength(1);
  expect(result.transactions[0]).toMatchObject({ amount_gross: "100.00", custom_str5: attemptId, m_payment_id: attemptId });
  const url = new URL(String(fetchMock.mock.calls[0][0]));
  expect(url.searchParams.get("offset")).toBe("100"); expect(url.searchParams.get("limit")).toBe("100");
  expect(url.searchParams.get("testing")).toBe("true");
});
test("successful empty page is distinguishable from a failed provider request", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ response: "Type,Sign,Gross,PF Payment ID\r\n" }) });
  await expect(fetchPayFastHistoryPage({ merchantId: "123" }, range)).resolves.toEqual({ rawCount: 0, transactions: [] });
});
test("lost webhook recovers through the same atomic settlement using exact tenant attempt", async () => {
  const admin = adminFor(attempt);
  await recoverPayFastTransaction(admin, gateway, transaction);
  expect(settleTenantGatewayPayment).toHaveBeenCalledWith(expect.objectContaining({
    provider: "payfast", transactionId: "pf-1", companyId: gateway.company_id, invoiceId: "invoice-1",
    orderId: "order-1", paymentType: "deposit", amount: 100, paymentAttempt: attempt,
  }));
});
test("history from another company or merchant/test mode never gets settled", async () => {
  await recoverPayFastTransaction(adminFor(attempt), gateway, { ...transaction, custom_str3: "other-company" });
  await recoverPayFastTransaction(adminFor(attempt), { ...gateway, merchantId: "different" }, transaction);
  await recoverPayFastTransaction(adminFor(attempt), { ...gateway, is_test: true }, transaction);
  expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test("history reference/type mismatch and unknown attempt are surfaced for repair", async () => {
  await expect(recoverPayFastTransaction(adminFor(attempt), gateway, { ...transaction, custom_str1: "wrong-order" })).rejects.toThrow("metadata");
  await expect(recoverPayFastTransaction(adminFor(null), gateway, transaction)).rejects.toThrow("unknown checkout");
  expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
});
test("legacy history only settles app metadata; unrelated merchant payments are ignored", async () => {
  await recoverPayFastTransaction(adminFor(null), gateway, { ...transaction, m_payment_id: "other-sale", custom_str5: undefined });
  expect(settleTenantGatewayPayment).not.toHaveBeenCalled();
  await recoverPayFastTransaction(adminFor(null), gateway, { ...transaction, m_payment_id: "", custom_str5: undefined,
    custom_str1: "invoice-1", custom_str2: "invoice", custom_str3: gateway.company_id, custom_str4: "invoice" });
  expect(settleTenantGatewayPayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: "invoice-1", paymentType: "invoice" }));
});
test("canonical PHP encoding handles punctuation, spaces and accent characters", () => {
  expect(pfUrlEncode(" A~!'()* café ")).toBe("A%7E%21%27%28%29%2A+caf%C3%A9");
});
test("tenant form uses stable unique merchant payment ID for history recovery", () => {
  const form = generatePayFastPaymentForm({ merchantId: "tenant-1", merchantKey: "dummy", passphrase: "dummy", testMode: false,
    amount: 100, itemName: "Event", returnUrl: "https://example.test/return", cancelUrl: "https://example.test/cancel",
    notifyUrl: "https://example.test/api/webhooks/payment-confirmation", nameFirst: "Client", nameLast: "", emailAddress: "client@example.test",
    merchantPaymentId: attemptId, customStr5: attemptId });
  expect(form).toContain(`name="m_payment_id" value="${attemptId}"`);
  expect(form).toContain(`name="custom_str5" value="${attemptId}"`);
});
