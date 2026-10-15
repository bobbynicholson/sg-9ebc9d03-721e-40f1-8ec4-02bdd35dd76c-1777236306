/** @jest-environment node */
import { resendTagValue } from "@/services/emailService";

describe("Resend tag values", () => {
  it("turns queue keys with dots into accepted tag values", () => {
    // order.created / quote.sent made Resend reject booking confirmations (422).
    expect(resendTagValue("order.created")).toBe("order_created");
    expect(resendTagValue("quote.sent")).toBe("quote_sent");
    expect(resendTagValue("aftersales_after-sales-1")).toBe("aftersales_after-sales-1");
  });

  it("keeps ordinary keys and company ids unchanged", () => {
    expect(resendTagValue("order_confirmed")).toBe("order_confirmed");
    expect(resendTagValue("0e139a19-6526-4e1f-9bf7-87d6adbee5f8")).toBe("0e139a19-6526-4e1f-9bf7-87d6adbee5f8");
  });

  it("never sends an empty tag", () => {
    expect(resendTagValue("")).toBe("custom");
    expect(resendTagValue("é")).toBe("_");
  });
});
