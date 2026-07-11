import {
  DEFAULT_CONFIDENTIALITY_NOTICE,
  buildCompanyTermsPath,
  buildCompanyTermsUrl,
  resolveConfidentialityNotice,
} from "@/lib/companyLegal";
import {
  appendPlatformLegalFooter,
  renderCompanyLegalFooterHtml,
  renderPlatformLegalFooterHtml,
} from "@/services/email/legalEmailFooter";

const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterAll(() => {
  if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
});

describe("company legal links", () => {
  it("builds a caterer-specific relative terms path", () => {
    expect(buildCompanyTermsPath("spit-braai-delivery")).toBe(
      "/terms/spit-braai-delivery",
    );
  });

  it("uses the configured public origin for email/PDF links", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    expect(buildCompanyTermsUrl("tenant-one")).toBe(
      "https://app.example.com/terms/tenant-one",
    );
  });

  it("uses the standard notice when a caterer has not customised it", () => {
    expect(resolveConfidentialityNotice("  ")).toBe(
      DEFAULT_CONFIDENTIALITY_NOTICE,
    );
  });
});

describe("email legal footer", () => {
  it("contains a tenant terms link and escapes customised notice HTML", () => {
    const html = renderCompanyLegalFooterHtml({
      companyId: "company-id",
      companySlug: "tenant-one",
      confidentialityNotice: '<script>alert("x")</script>',
      origin: "https://example.com",
    });

    expect(html).toContain('data-cms-legal-footer="true"');
    expect(html).toContain("https://example.com/terms/tenant-one");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("platform variant links the platform terms, not a tenant page", () => {
    const html = renderPlatformLegalFooterHtml("https://example.com");
    expect(html).toContain('data-cms-legal-footer="true"');
    expect(html).toContain("https://example.com/terms");
    expect(html).not.toContain("/terms/");
    expect(html).toContain(DEFAULT_CONFIDENTIALITY_NOTICE.slice(0, 40));
  });

  it("appendPlatformLegalFooter is idempotent and respects </body>", () => {
    const once = appendPlatformLegalFooter(
      "<html><body><p>Hi</p></body></html>",
      "https://example.com",
    );
    expect(once).toMatch(/data-cms-legal-footer.*<\/body>/s);
    expect(appendPlatformLegalFooter(once, "https://example.com")).toBe(once);
  });
});
