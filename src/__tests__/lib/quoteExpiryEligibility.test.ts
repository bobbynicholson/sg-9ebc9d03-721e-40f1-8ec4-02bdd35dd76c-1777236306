import { isClientEligibleForExpiry } from "@/lib/quoteExpiryEligibility";

describe("isClientEligibleForExpiry", () => {
  it("tells the client about a sent quote", () => {
    expect(isClientEligibleForExpiry({ status: "sent", sent_at: "2026-10-01T08:00:00Z" })).toBe(true);
    expect(isClientEligibleForExpiry({ status: "sent" })).toBe(true);
  });

  it("never tells the client about a draft", () => {
    expect(isClientEligibleForExpiry({ status: "draft" })).toBe(false);
    expect(isClientEligibleForExpiry({ status: "draft", imported_at: "2026-10-18T09:00:00Z" })).toBe(false);
  });

  it("stays quiet about an imported quote that was never sent from the app", () => {
    expect(isClientEligibleForExpiry({ status: "sent", imported_at: "2026-10-18T09:00:00Z", sent_at: null })).toBe(false);
  });

  it("tells the client once an imported quote has been sent from the app", () => {
    expect(isClientEligibleForExpiry({
      status: "sent", imported_at: "2026-10-18T09:00:00Z", sent_at: "2026-10-19T10:00:00Z",
    })).toBe(true);
  });

  it("ignores statuses the expiry run doesn't pick up", () => {
    for (const status of ["accepted", "rejected", "expired", null, undefined]) {
      expect(isClientEligibleForExpiry({ status })).toBe(false);
    }
  });
});
