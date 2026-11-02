import {
  consumeApiKeyRateLimitsWindowed,
  getRateLimitClientIp,
  hashRateLimitIdentifier,
} from "@/lib/apiKeyRateLimit";

const originalSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSecret;
});

test("rate-limit identifiers are keyed hashes and stable for the same identifier", () => {
  const email = "client@example.test";
  const hashed = hashRateLimitIdentifier(email);

  expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  expect(hashed).not.toContain(email);
  expect(hashRateLimitIdentifier(email)).toBe(hashed);
  expect(hashRateLimitIdentifier("another@example.test")).not.toBe(hashed);
});

test("multi-dimension RPC receives hashes and independent limits", async () => {
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
    expect(name).toBe("consume_api_key_rate_limits_windowed");
    expect(args).toHaveProperty("p_key_hashes");
    return {
      data: [{ allowed: true, remaining: 4, reset_in_ms: 12_000 }],
      error: null,
    };
  });
  const serviceClient = { rpc };
  const dimensions = [
    { key: "client-magic-link:email:client@example.test", max: 5 },
    { key: "client-magic-link:ip:203.0.113.8", max: 60 },
  ];

  await expect(consumeApiKeyRateLimitsWindowed(serviceClient, dimensions, { windowSeconds: 600 }))
    .resolves.toEqual({ allowed: true, remaining: 4, resetInMs: 12_000 });

  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("consume_api_key_rate_limits_windowed", {
    p_key_hashes: dimensions.map(({ key }) => hashRateLimitIdentifier(key)),
    p_max_per_key: [5, 60],
    p_window_seconds: 600,
  });
  const serializedArgs = JSON.stringify(rpc.mock.calls[0][1]);
  expect(serializedArgs).not.toContain("client@example.test");
  expect(serializedArgs).not.toContain("203.0.113.8");
});

test("shared limiter errors fail closed without returning database details", async () => {
  const rpc = jest.fn(async () => ({ data: null, error: { message: "database secret" } }));
  const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);

  await expect(consumeApiKeyRateLimitsWindowed({ rpc }, [
    { key: "client-magic-link:email:client@example.test", max: 5 },
  ], { windowSeconds: 600 })).resolves.toEqual({
    allowed: false,
    remaining: 0,
    resetInMs: 600_000,
    unavailable: true,
  });

  expect(warning).toHaveBeenCalledWith("[rateLimit] shared limiter unavailable; protected action denied");
  expect(warning.mock.calls.flat().join(" ")).not.toContain("database secret");
  warning.mockRestore();
});

test("client IP resolution prefers Vercel's platform header and falls back safely", () => {
  expect(getRateLimitClientIp({
    headers: {
      "x-vercel-forwarded-for": "203.0.113.8, 10.0.0.1",
      "x-forwarded-for": "198.51.100.4",
    },
    socket: { remoteAddress: "127.0.0.1" },
  })).toBe("203.0.113.8");

  expect(getRateLimitClientIp({
    headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.2" },
  })).toBe("198.51.100.4");
  expect(getRateLimitClientIp({ headers: {}, socket: { remoteAddress: "127.0.0.1" } }))
    .toBe("127.0.0.1");
  expect(getRateLimitClientIp({ headers: {} })).toBe("unknown");
});
