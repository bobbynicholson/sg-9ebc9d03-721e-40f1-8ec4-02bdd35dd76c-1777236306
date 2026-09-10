import {
  buildWhatsAppUrl,
  isLikelyMobile,
  normaliseToE164,
  openWhatsApp,
} from "@/lib/whatsapp";

describe("WhatsApp deep-link flow", () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      writable: true,
      value: jest.fn(() => ({})),
    });
  });

  it("normalises the Bobby Nicholson number to the correct South African recipient", () => {
    expect(normaliseToE164("+27 83 652 5755")).toBe("27836525755");
    expect(normaliseToE164("083 652 5755")).toBe("27836525755");
    expect(isLikelyMobile("+27836525755")).toBe(true);
    expect(isLikelyMobile("+2783")).toBe(false);
  });

  it("builds a desktop link with the exact current message encoded", () => {
    const message = "Hello Bobby,\nYour quote is ready. Please review it.";
    const url = buildWhatsAppUrl("+27836525755", message);

    expect(url).toBe(
      `https://web.whatsapp.com/send?phone=27836525755&text=${encodeURIComponent(message)}`,
    );
  });

  it("uses the mobile universal link when the user is on a phone", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    });

    expect(buildWhatsAppUrl("+27836525755", "Hello Bobby")).toBe(
      "https://wa.me/27836525755?text=Hello%20Bobby",
    );
  });

  it("reports a successful WhatsApp launch", () => {
    expect(openWhatsApp("+27836525755", "Hello Bobby")).toBe(true);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("phone=27836525755"),
      "_blank",
    );
  });
});
