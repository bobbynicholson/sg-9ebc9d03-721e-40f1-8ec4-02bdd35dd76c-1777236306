import {
  parseClientTermsInline,
  sanitizeClientTermsHtml,
  renderClientTermsHtml,
} from "@/lib/clientTermsFormatting";

describe("clientTermsFormatting", () => {
  it("renders bold spans without exposing formatting markers", () => {
    expect(renderClientTermsHtml("**Cancellation Policy**\nDeposit is required.")).toBe(
      "<p><strong>Cancellation Policy</strong><br />Deposit is required.</p>",
    );
  });

  it("escapes raw HTML before rendering client terms", () => {
    expect(renderClientTermsHtml("Use <script>alert(1)</script> <strong>carefully</strong>")).toBe(
      "<p>Use alert(1) <strong>carefully</strong></p>",
    );
  });

  it("returns inline segments for PDF rendering", () => {
    expect(parseClientTermsInline("A **bold** heading")).toEqual([
      { text: "A ", bold: false },
      { text: "bold", bold: true },
      { text: " heading", bold: false },
    ]);
  });

  it("keeps only the safe rich-text subset", () => {
    expect(sanitizeClientTermsHtml("<div><strong>Terms</strong><img src=x onerror=1></div>")).toBe(
      "<p><strong>Terms</strong></p>",
    );
  });
});
