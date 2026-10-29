/**
 * Regression coverage for the 2026-06-12 fix: quote-accepted emails
 * carried RELATIVE links ("/q/{token}") whenever NEXT_PUBLIC_APP_URL
 * was unset, because getServerOrigin() had no fallback. The link
 * builders now fall back to VERCEL_URL vars, then a request-derived
 * origin override.
 */
import { buildPublicQuoteUrlServer, buildPayInvoiceUrlServer } from "@/lib/customerLinksServer";

const TOKEN = "49eedbbe-7989-41d3-94c2-adbe7fb773fc";

const ENV_KEYS = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_VERCEL_URL", "VERCEL_URL"] as const;
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

describe("balance reminder pay link (cron: no request, no config)", () => {
  it("is cateringms.com with the company slug", () => {
    process.env.VERCEL_URL = "sg-ebc6a518-dd91-41cf-be1c-5c96b651e0d7-1aixtkq0l.vercel.app";
    expect(buildPayInvoiceUrlServer("8475db1f", { slug: "spit-braai-delivery" })).toBe(
      "https://cateringms.com/spit-braai-delivery/pay/i/8475db1f",
    );
  });
});

describe("buildPublicQuoteUrlServer", () => {
  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.cateringms.com/";
    expect(buildPublicQuoteUrlServer(TOKEN)).toBe(`https://app.cateringms.com/q/${TOKEN}`);
  });

  // 2026-10-29: a balance reminder (cron, no request origin) sent a
  // *.vercel.app deployment link that put customers on a Vercel login
  // page. Deployment hosts are never used; the fallback is cateringms.com.
  it("never falls back to a Vercel deployment host - uses cateringms.com", () => {
    process.env.NEXT_PUBLIC_VERCEL_URL = "preview-abc.vercel.app";
    process.env.VERCEL_URL = "sg-ebc6a518-dd91-1aixtkq0l.vercel.app";
    expect(buildPublicQuoteUrlServer(TOKEN)).toBe(`https://cateringms.com/q/${TOKEN}`);
  });

  it("ignores a Vercel deployment host even when it is the request origin", () => {
    expect(buildPublicQuoteUrlServer(TOKEN, "spit-braai-delivery", "https://sg-abc.vercel.app")).toBe(
      `https://cateringms.com/spit-braai-delivery/q/${TOKEN}`,
    );
  });

  it("falls back to the request-derived origin override when no env is set", () => {
    expect(buildPublicQuoteUrlServer(TOKEN, null, "http://localhost:3001")).toBe(
      `http://localhost:3001/q/${TOKEN}`,
    );
  });

  it("prefers explicit APP_URL over the request override", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.cateringms.com";
    expect(buildPublicQuoteUrlServer(TOKEN, null, "http://localhost:3001")).toBe(
      `https://app.cateringms.com/q/${TOKEN}`,
    );
  });

  it("prefers the request override over the Vercel deployment host", () => {
    // VERCEL_URL is always set on Vercel and points at the deploy-
    // protected *.vercel.app host - the request origin must win or
    // customers land behind a Vercel login wall.
    process.env.NEXT_PUBLIC_VERCEL_URL = "sg-deploy-abc123.vercel.app";
    expect(buildPublicQuoteUrlServer(TOKEN, null, "https://cateringms.com")).toBe(
      `https://cateringms.com/q/${TOKEN}`,
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
