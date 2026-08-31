import { getTenantSlugFromPathname } from "@/lib/tenantRoute";

describe("tenant route context", () => {
  it("extracts a tenant from tenant-scoped paths", () => {
    expect(getTenantSlugFromPathname("/spit-braai-delivery/admin/dashboard")).toBe("spit-braai-delivery");
    expect(getTenantSlugFromPathname("/spit-braai-delivery/team-portal/kitchen?tab=today")).toBe("spit-braai-delivery");
  });

  it("does not treat global platform paths as tenant paths", () => {
    expect(getTenantSlugFromPathname("/admin/platform/dashboard")).toBe("");
    expect(getTenantSlugFromPathname("/admin/dashboard")).toBe("");
    expect(getTenantSlugFromPathname("/auth/login")).toBe("");
  });
});
