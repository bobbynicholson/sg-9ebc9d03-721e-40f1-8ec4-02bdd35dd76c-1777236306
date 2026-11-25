import { isQuotePastExpiry, quoteExpiryDate, readQuoteExpiryMode } from "@/lib/quoteExpiryPolicy";
import { deriveQuoteIntelligence } from "@/lib/quoteIntelligence";

const quote = {
  id: "quote-1",
  status: "sent",
  valid_until: "2026-11-10",
  event_date: "2026-12-15",
  created_at: "2026-11-01T10:00:00Z",
  sent_at: "2026-11-02T10:00:00Z",
};

test("company rule chooses the effective quote deadline", () => {
  expect(readQuoteExpiryMode({ quoteExpiryMode: "event_date" })).toBe("event_date");
  expect(readQuoteExpiryMode({ quoteExpiryMode: "unknown" })).toBe("valid_until");
  expect(quoteExpiryDate(quote, "event_date")).toBe("2026-12-15");
  expect(quoteExpiryDate(quote, "valid_until")).toBe("2026-11-10");
  expect(quoteExpiryDate({ valid_until: "2026-11-10" }, "event_date")).toBe("2026-11-10");
});

test("future December event stays open under event-date policy", () => {
  expect(isQuotePastExpiry(quote, "event_date", "2026-11-24")).toBe(false);
  expect(deriveQuoteIntelligence(quote, "event_date", "2026-11-24").bucket).not.toBe("expired");
  expect(isQuotePastExpiry(quote, "valid_until", "2026-11-24")).toBe(true);
  expect(deriveQuoteIntelligence(quote, "valid_until", "2026-11-24").bucket).toBe("expired");
});

test("event-day expiry starts that morning, while valid-until lasts through its date", () => {
  expect(isQuotePastExpiry(quote, "event_date", "2026-12-14")).toBe(false);
  expect(isQuotePastExpiry(quote, "event_date", "2026-12-15")).toBe(true);
  expect(isQuotePastExpiry(quote, "valid_until", "2026-11-10")).toBe(false);
  expect(isQuotePastExpiry(quote, "valid_until", "2026-11-11")).toBe(true);
});
