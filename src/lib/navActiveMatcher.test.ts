import { resolveActiveHref } from "./navActiveMatcher";

const SLUG = "/spit-braai-delivery";
const withSlug = (h: string) => `${SLUG}${h}`;
const at = (asPath: string, pathname = "/[company_slug]/team-portal/waiter/dashboard") => ({
  router: { pathname, asPath },
  withSlug,
});

const WAITER = [
  "/team-portal/waiter/dashboard#service",
  "/team-portal/waiter/dashboard#clock",
  "/team-portal/waiter/notifications",
  "/account/settings",
];

describe("resolveActiveHref", () => {
  it("lights the first section link when the page has no hash", () => {
    expect(resolveActiveHref(WAITER, at(`${SLUG}/team-portal/waiter/dashboard`))).toBe(WAITER[0]);
  });

  it("lights the section link matching the current hash", () => {
    expect(resolveActiveHref(WAITER, at(`${SLUG}/team-portal/waiter/dashboard#clock`))).toBe(WAITER[1]);
  });

  it("still prefers the most specific path", () => {
    const hrefs = ["/admin/orders", "/admin/orders/new", "/admin/order-assignments"];
    expect(resolveActiveHref(hrefs, at(`${SLUG}/admin/orders/new`, "/[company_slug]/admin/orders/new"))).toBe("/admin/orders/new");
    expect(resolveActiveHref(hrefs, at(`${SLUG}/admin/order-assignments`, "/[company_slug]/admin/order-assignments"))).toBe("/admin/order-assignments");
  });

  it("keeps query-specific links ahead of the bare path", () => {
    const hrefs = ["/admin/equipment", "/admin/equipment?tab=shortages"];
    expect(resolveActiveHref(hrefs, at(`${SLUG}/admin/equipment?tab=shortages`, "/[company_slug]/admin/equipment"))).toBe(hrefs[1]);
    expect(resolveActiveHref(hrefs, at(`${SLUG}/admin/equipment`, "/[company_slug]/admin/equipment"))).toBe(hrefs[0]);
  });

  it("returns null when nothing matches", () => {
    expect(resolveActiveHref(WAITER, at(`${SLUG}/team-portal/kitchen/dashboard`, "/[company_slug]/team-portal/kitchen/dashboard"))).toBeNull();
  });
});
