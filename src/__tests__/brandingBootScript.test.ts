/** @jest-environment jsdom */
// The inline boot script paints a tenant's saved palette before the app
// loads. It must set exactly what applyBrandingToDOM sets, and keep a
// first-visit tenant page blank instead of showing the default colours.
import { applyBrandingToDOM } from "@/lib/branding/applyBranding";
import { BRANDING_BOOT_SCRIPT, BRAND_PENDING_ATTR } from "@/lib/branding/bootScript";

const VARS = [
  "--brand-primary", "--brand-secondary", "--brand-accent",
  "--brand-primary-rgb", "--brand-secondary-rgb", "--brand-accent-rgb",
  "--primary", "--primary-foreground", "--ring",
  "--sidebar-primary", "--sidebar-primary-foreground", "--sidebar-ring",
];
const ROW = { id: "co-1", slug: "spit-braai-delivery", companyName: "Spit Braai Delivery", logoUrl: null,
  primaryColor: "#e11d48", secondaryColor: "#5b21b6", accentColor: "#fde047" };

const runBoot = (path: string) => {
  window.history.pushState({}, "", path);
  // eslint-disable-next-line no-new-func
  new Function(BRANDING_BOOT_SCRIPT)();
};
const snapshot = () => Object.fromEntries(VARS.map((v) => [v, document.documentElement.style.getPropertyValue(v)]));

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute(BRAND_PENDING_ATTR);
});
afterEach(() => jest.useRealTimers());

describe("branding boot script", () => {
  it("paints the saved palette for the company in the address, same values as the app", () => {
    applyBrandingToDOM(ROW);
    const expected = snapshot();
    document.documentElement.removeAttribute("style");

    localStorage.setItem("cms.branding.co-1", JSON.stringify(ROW));
    runBoot("/spit-braai-delivery/admin/dashboard");
    expect(snapshot()).toEqual(expected);
    expect(document.documentElement.hasAttribute(BRAND_PENDING_ATTR)).toBe(false);
  });

  it("first visit with nothing saved: keeps the page blank, never more than a few seconds", () => {
    runBoot("/spit-braai-delivery/admin/dashboard");
    expect(document.documentElement.hasAttribute(BRAND_PENDING_ATTR)).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("");
    jest.advanceTimersByTime(10000);
    expect(document.documentElement.hasAttribute(BRAND_PENDING_ATTR)).toBe(false);
  });

  it("never applies another company's saved colours", () => {
    localStorage.setItem("cms.branding.co-2", JSON.stringify({ ...ROW, id: "co-2", slug: "other-caterer" }));
    runBoot("/spit-braai-delivery/admin/dashboard");
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("");
  });

  it("leaves marketing and global pages alone", () => {
    localStorage.setItem("cms.branding.co-1", JSON.stringify(ROW));
    for (const path of ["/", "/pricing", "/auth/login", "/admin/platform/companies"]) runBoot(path);
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("");
    expect(document.documentElement.hasAttribute(BRAND_PENDING_ATTR)).toBe(false);
  });
});
