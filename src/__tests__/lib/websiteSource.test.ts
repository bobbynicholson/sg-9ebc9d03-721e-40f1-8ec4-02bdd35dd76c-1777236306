import { extractWebsiteText } from "@/server/chatbot/websiteSource";

describe("website knowledge source extraction", () => {
  it("keeps readable page content and removes executable content", () => {
    const result = extractWebsiteText(`
      <html><head><title>Cancellation policy</title><script>window.secret = true</script></head>
      <body><nav>Menu</nav><main><h1>Cancellation policy</h1><p>${"Customers may cancel a catering booking in writing at least 48 hours before the event. ".repeat(3)}</p><p>Contact our support team for help.</p></main><style>.private{display:none}</style></body></html>
    `);
    expect(result.title).toBe("Cancellation policy");
    expect(result.text).toContain("Customers may cancel");
    expect(result.text).not.toContain("window.secret");
    expect(result.text).not.toContain(".private");
  });
});
