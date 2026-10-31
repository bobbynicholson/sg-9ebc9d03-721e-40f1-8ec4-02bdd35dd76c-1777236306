/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("@/lib/logger", () => ({ log: jest.fn() }));
jest.mock("@/lib/subscriptionApiGate", () => ({ isSubscriptionGatedRequest: jest.fn(() => false), blockIfCompanyUnpaid: jest.fn() }));
jest.mock("@/lib/platformApiGate", () => ({ isPlatformOnlyRequest: jest.fn(() => false), blockUnlessPlatformAdmin: jest.fn() }));

import { log } from "@/lib/logger";
import { withApiLogging } from "@/lib/withApiLogging";
import { isSubscriptionGatedRequest } from "@/lib/subscriptionApiGate";

beforeEach(() => { jest.clearAllMocks(); });
function response() {
  return { statusCode: 200, headersSent: false, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json: jest.fn(), end: jest.fn() };
}

it("redacts request logs while the handler and gates receive the original values", async () => {
  const req: any = { method: "POST", url: "/api/public/quotes/quote-marker/accept?code=oauth-marker", query: { token: "quote-marker", code: "oauth-marker", page: "2" }, headers: {}, body: { credentials: { secretKey: "payment-marker" } } };
  const handler = jest.fn();
  const res: any = response();
  await withApiLogging(handler)(req, res);
  expect(handler).toHaveBeenCalledWith(req, res);
  expect(isSubscriptionGatedRequest).toHaveBeenCalledWith("POST", req.url);
  const output = JSON.stringify((log as jest.Mock).mock.calls);
  for (const marker of ["quote-marker", "oauth-marker", "payment-marker"]) expect(output).not.toContain(marker);
  expect(req.body.credentials.secretKey).toBe("payment-marker");
  expect(req.query.token).toBe("quote-marker");
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
});

it("redacts error response logs without changing the HTTP response", async () => {
  const payload = { error: "provider rejected request", credentials: { secretKey: "response-marker" } };
  const req: any = { method: "POST", url: "/api/payment-gateways", query: {}, headers: {} };
  const res: any = response();
  const send = res.json;
  await withApiLogging((_req, reply) => { reply.status(400).json(payload); })(req, res);
  expect(send).toHaveBeenCalledWith(payload);
  expect(JSON.stringify((log as jest.Mock).mock.calls)).not.toContain("response-marker");
});

it("keeps tokens out of non-JSON response and exception URL logs", async () => {
  const req: any = { method: "GET", url: "/api/public/invoices/invoice-marker/pdf", query: { token: "invoice-marker" }, headers: {} };
  const res: any = response();
  await withApiLogging((_req, reply) => { reply.end("pdf"); })(req, res);
  await withApiLogging(() => { throw new Error("synthetic failure"); })(req, response() as any);
  expect(JSON.stringify((log as jest.Mock).mock.calls)).not.toContain("invoice-marker");
});
