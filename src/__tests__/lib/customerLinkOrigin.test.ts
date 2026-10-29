// Links people open (emails, PDFs, the app) must never use a *.vercel.app
// deployment host: those are login-protected per deploy.
import { customerLinkOrigin, publicAppOrigin } from "@/lib/publicAppOrigin";

describe("customerLinkOrigin", () => {
  it("skips Vercel deployment hosts and falls back to cateringms.com", () => {
    expect(customerLinkOrigin("https://sg-abc-1aixtkq0l.vercel.app", "preview.vercel.app")).toBe("https://cateringms.com");
    expect(customerLinkOrigin(null, undefined, "")).toBe("https://cateringms.com");
  });
  it("keeps the first real domain, without a trailing slash", () => {
    expect(customerLinkOrigin("", "https://cateringms.com/")).toBe("https://cateringms.com");
    expect(customerLinkOrigin("app.example.co.za")).toBe("https://app.example.co.za");
  });
  it("keeps localhost for local development", () => {
    expect(customerLinkOrigin(null, "http://localhost:3001")).toBe("http://localhost:3001");
  });
});

describe("payment provider return origin", () => {
  it("does not use a Vercel production host either", () => {
    expect(publicAppOrigin({ environment: "production", vercelProductionUrl: "https://my-project.vercel.app" })).toBe("https://cateringms.com");
    expect(publicAppOrigin({ environment: "production", vercelProductionUrl: "https://cateringms.com" })).toBe("https://cateringms.com");
  });
});
