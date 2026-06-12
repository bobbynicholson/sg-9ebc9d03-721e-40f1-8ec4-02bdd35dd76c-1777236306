/**
 * Regression coverage for the 2026-06-12 fix: quote-accepted emails
 * carried RELATIVE links ("/q/{token}") whenever NEXT_PUBLIC_APP_URL
 * was unset, because getServerOrigin() had no fallback. The link
 * builders now fall back to VERCEL_URL vars, then a request-derived
 * origin override.
 */
import { buildPublicQuoteUrlServer, buildPayInvoiceUrlServer } from "@/lib/customerLinksServer";

const TOKEN = "49eedbbe-7989-41d3-94c2-adbe7fb773fc";

const ENV_KEYS = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_VERCEL_URL", "VERCEL_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("buildPublicQuoteUrlServer", () => {
  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.cateringms.com/";
    expect(buildPublicQuoteUrlServer(TOKEN)).toBe(`https://app.cateringms.com/q/${TOKEN}`);
  });

  it("falls back to VERCEL_URL host vars, adding https://", () => {
    process.env.NEXT_PUBLIC_VERCEL_URL = "preview-abc.vercel.app";
    expect(buildPublicQuoteUrlServer(TOKEN)).toBe(`https://preview-abc.vercel.app/q/${TOKEN}`);
  });

  it("falls back to the request-derived origin override when no env is set", () => {
    expect(buildPublicQuoteUrlServer(TOKEN, null, "http://localhost:3001")).toBe(
      `http://localhost:3001/q/${TOKEN}`,
    );
  });

  it("prefers env over the request override", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.cateringms.com";
    expect(buildPublicQuoteUrlServer(TOKEN, null, "http://localhost:3001")).toBe(
      `https://app.cateringms.com/q/${TOKEN}`,
    );
  });

  it("prefixes the tenant slug segment", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.cateringms.com";
    expect(buildPublicQuoteUrlServer(TOKEN, "spit-braai-delivery")).toBe(
      `https://app.cateringms.com/spit-braai-delivery/q/${TOKEN}`,
    );
  });

  it("returns null without a token", () => {
    expect(buildPublicQuoteUrlServer(null)).toBeNull();
  });
});

describe("buildPayInvoiceUrlServer", () => {
  it("keeps slug + print query behaviour", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.cateringms.com";
    expect(buildPayInvoiceUrlServer("tok123", { print: true, slug: "spit-braai-delivery" })).toBe(
      "https://app.cateringms.com/spit-braai-delivery/pay/i/tok123?print=1",
    );
  });
});
