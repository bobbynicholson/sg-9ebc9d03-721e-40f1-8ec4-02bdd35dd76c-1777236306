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

  afterAll(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUserAgent });
  });

  it("normalises the Bobby Nicholson number to the correct South African recipient", () => {
    expect(normaliseToE164("+27 83 652 5755")).toBe("27836525755");
    expect(normaliseToE164("083 652 5755")).toBe("27836525755");
    expect(isLikelyMobile("+27836525755")).toBe(true);
    expect(isLikelyMobile("+2783")).toBe(false);
  });

  it("builds a desktop link with the exact current message encoded", () => {
    const message = "Hello Bobby,\nPlate, knife & fork — R 100.00 ✓";
    const url = buildWhatsAppUrl("+27836525755", message);

    expect(url).toBe(
      `whatsapp://send?phone=27836525755&text=${encodeURIComponent(message)}`,
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

  it("requests the registered desktop app in the current tab", () => {
    expect(openWhatsApp("+27836525755", "Hello Bobby")).toBe(true);
    expect(window.open).toHaveBeenCalledWith(
      "whatsapp://send?phone=27836525755&text=Hello%20Bobby",
      "_self",
    );
  });

  it("opens Web only when explicitly requested", () => {
    expect(buildWhatsAppUrl("083 652 5755", "Hello & welcome", "web"))
      .toBe("https://web.whatsapp.com/send?phone=27836525755&text=Hello%20%26%20welcome");
    expect(openWhatsApp("083 652 5755", "Hello", "web")).toBe(true);
    expect(window.open).toHaveBeenCalledWith("https://web.whatsapp.com/send?phone=27836525755&text=Hello", "_blank");
  });

  it("does not open a chat without a phone number", () => {
    for (const phone of [null, undefined, "", "letters only"]) {
      expect(buildWhatsAppUrl(phone, "Hello")).toBeNull();
      expect(openWhatsApp(phone, "Hello")).toBe(false);
    }
    expect(window.open).not.toHaveBeenCalled();
    expect(buildWhatsAppUrl("083 652 5755")).toBe("whatsapp://send?phone=27836525755");
  });
});
