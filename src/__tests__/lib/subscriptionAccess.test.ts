import { hasSubscriptionAccess, shouldShowExpiredSubscriptionPage } from "@/lib/subscriptionAccess";

const NOW = new Date("2026-10-02T00:00:00.000Z").getTime();

it("does not treat a stale expired hint as expired after paid access is restored", () => {
  expect(shouldShowExpiredSubscriptionPage("active", null, true, NOW)).toBe(false);
});

it("keeps an expired account on the billing page until access is restored", () => {
  expect(shouldShowExpiredSubscriptionPage("suspended", null, true, NOW)).toBe(true);
  expect(shouldShowExpiredSubscriptionPage(null, null, true, NOW)).toBe(true);
});

it("recognizes current access for paid, grace-period, and unexpired trial accounts", () => {
  expect(hasSubscriptionAccess("active", null, NOW)).toBe(true);
  expect(hasSubscriptionAccess("past_due", null, NOW)).toBe(true);
  expect(hasSubscriptionAccess("trial", "2026-10-03T00:00:00.000Z", NOW)).toBe(true);
  expect(hasSubscriptionAccess("trial", null, NOW)).toBe(true);
  expect(hasSubscriptionAccess("trial", "2026-10-01T00:00:00.000Z", NOW)).toBe(false);
});
