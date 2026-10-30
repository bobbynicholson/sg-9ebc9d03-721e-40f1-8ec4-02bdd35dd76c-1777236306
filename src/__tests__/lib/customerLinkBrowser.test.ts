/* eslint-disable @typescript-eslint/no-explicit-any */
// In the browser the order link is minted through the server route
// (signed-in users can't run the mint RPC); any failure still gives a
// working tokenless link.
import { mintOrderCustomerLink } from "@/lib/customerLinksServer";

const sb: any = { rpc: jest.fn() };
const input = { sb, companyId: "co-1", orderId: "order-1", label: "deposit-invoice-email", slug: "spit-braai", origin: "https://cateringms.com" };

afterEach(() => { (global as any).fetch = undefined; jest.clearAllMocks(); });

test("browser calls the link route and builds the secure order link", async () => {
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ token: "tok-123" }) }));
  await expect(mintOrderCustomerLink(input)).resolves.toBe("https://cateringms.com/spit-braai/c/order/order-1?t=tok-123");
  expect((global as any).fetch).toHaveBeenCalledWith("/api/orders/order-1/customer-link", expect.objectContaining({
    method: "POST", body: JSON.stringify({ label: "deposit-invoice-email" }) }));
  expect(sb.rpc).not.toHaveBeenCalled();
});

test("a refused or failed route falls back to the tokenless order link", async () => {
  (global as any).fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Staff only" }) }));
  await expect(mintOrderCustomerLink(input)).resolves.toBe("https://cateringms.com/spit-braai/c/order/order-1");
  (global as any).fetch = jest.fn(async () => { throw new Error("offline"); });
  await expect(mintOrderCustomerLink(input)).resolves.toBe("https://cateringms.com/spit-braai/c/order/order-1");
});
