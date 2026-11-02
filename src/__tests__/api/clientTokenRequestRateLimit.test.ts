import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitsWindowed } from "@/lib/apiKeyRateLimit";
import requestClientTokenHandler from "@/pages/api/client-tokens/request";

jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/apiKeyRateLimit", () => ({
  consumeApiKeyRateLimitsWindowed: jest.fn(),
  getRateLimitClientIp: jest.fn(() => "203.0.113.8"),
}));
jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (handler: unknown) => handler }));
jest.mock("@/services/emailService", () => ({ emailService: { sendEmail: jest.fn() } }));

function response() {
  const res = { statusCode: 200, status: jest.fn(), json: jest.fn() };
  res.status.mockImplementation((code: number) => { res.statusCode = code; return res; });
  res.json.mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

test.each([
  [{ allowed: false, remaining: 0, resetInMs: 60_000 }, 200],
  [{ allowed: false, remaining: 0, resetInMs: 60_000, unavailable: true }, 503],
])("client account-link request stops before tenant lookup when limiter denies it", async (limitResult, status) => {
  const from = jest.fn();
  (getServiceSupabase as jest.Mock).mockReturnValue({ from });
  (consumeApiKeyRateLimitsWindowed as jest.Mock).mockResolvedValue(limitResult);
  const res = response();

  await requestClientTokenHandler({
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.2" },
    socket: { remoteAddress: "127.0.0.1" },
    body: { email: "Client@Example.Test" },
  } as never, res as never);

  expect(res.statusCode).toBe(status);
  expect(from).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({
    ...(status === 200 ? { ok: true } : { error: "Account links are temporarily unavailable. Please try again shortly." }),
  });
});

test("client account-link route applies distinct recipient and IP limits", async () => {
  const from = jest.fn(() => ({ select: jest.fn(async () => ({ data: [], error: null })) }));
  const serviceClient = { from };
  (getServiceSupabase as jest.Mock).mockReturnValue(serviceClient);
  (consumeApiKeyRateLimitsWindowed as jest.Mock).mockResolvedValue({ allowed: true, remaining: 2, resetInMs: 60_000 });
  const res = response();

  await requestClientTokenHandler({
    method: "POST",
    headers: {},
    body: { email: " Client@Example.Test " },
  } as never, res as never);

  expect(consumeApiKeyRateLimitsWindowed).toHaveBeenCalledWith(serviceClient, [
    { key: "client-account-link:email:client@example.test", max: 3 },
    { key: "client-account-link:ip:203.0.113.8", max: 60 },
  ], { windowSeconds: 60 });
  expect(res.statusCode).toBe(200);
  expect(res.json).toHaveBeenCalledWith({ ok: true });
});
