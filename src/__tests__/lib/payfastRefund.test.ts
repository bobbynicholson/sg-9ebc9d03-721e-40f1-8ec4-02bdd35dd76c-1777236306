/** @jest-environment node */
import crypto from "crypto";
import { PayFastService } from "@/lib/payfastService";
const config = { merchantId: "10004002", merchantKey: "offline-key", passphrase: "offline phrase", testMode: false };
const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => { fetchMock.mockReset(); global.fetch = fetchMock; });
afterEach(() => { global.fetch = originalFetch; });
const success = { code: 200, status: "success", data: { response: true, message: "Success" } };

test("refund sends documented cents/buyer notification and an alphabetical REST signature", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => success });
  const result = await new PayFastService(config).refundTransaction("pf-1", 10050, "Customer cancellation");
  expect(result.ok).toBe(true);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.payfast.co.za/refunds/pf-1");
  const body = new URLSearchParams(options.body);
  expect(body.get("amount")).toBe("10050"); expect(body.get("notify_buyer")).toBe("1");
  // An independent fixed-order signature protects against accidentally
  // reusing the checkout form's insertion-order signature algorithm.
  const source = `amount=10050&merchant-id=10004002&notify_buyer=1&passphrase=offline+phrase&reason=Customer+cancellation&timestamp=${encodeURIComponent(options.headers.timestamp)}&version=v1`;
  expect(options.headers.signature).toBe(crypto.createHash("md5").update(source).digest("hex"));
  expect(options.signal).toBeDefined();
});

test.each([{}, { status: "success", data: {} }, null])("HTTP 200 with unconfirmed response %p stays unknown", async (body) => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body });
  expect(await new PayFastService(config).refundTransaction("pf-1", 100, "Refund"))
    .toMatchObject({ ok: false, status: 0 });
});
test("an explicit rejected refund is not recorded as successful even with HTTP 200", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "failed", data: { response: false, message: "Not refundable" } }) });
  expect(await new PayFastService(config).refundTransaction("pf-1", 100, "Refund"))
    .toMatchObject({ ok: false, status: 400, error: "Not refundable" });
});
test("refund query returns the provider's remaining balance and required payout method", async () => {
  const available = { status: "REFUNDABLE", amount_available_for_refund: 5000, amount_original: 10000, refund_partial: { method: "BANK_PAYOUT" } };
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => available });
  expect(await new PayFastService(config).queryRefundAvailability("pf-1")).toMatchObject({ ok: true, body: available });
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.payfast.co.za/refunds/query/pf-1");
});
test("sandbox refunds make no network request", async () => {
  const service = new PayFastService({ ...config, testMode: true });
  expect((await service.queryRefundAvailability("pf-1")).ok).toBe(false);
  expect((await service.refundTransaction("pf-1", 100, "Refund")).ok).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
test.each([0, -1, 1.5, Infinity])("invalid refund cents %p cannot contact the provider", async (amount) => {
  expect((await new PayFastService(config).refundTransaction("pf-1", amount, "Refund")).ok).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
