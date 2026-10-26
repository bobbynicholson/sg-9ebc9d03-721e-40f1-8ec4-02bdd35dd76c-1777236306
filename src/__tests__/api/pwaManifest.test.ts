/** @jest-environment node */
import handler from "@/pages/api/pwa/manifest";
import iconHandler from "@/pages/api/pwa/icon";
import { getPwaBranding } from "@/lib/pwa/serverBranding";
import { buildPwaManifest, pwaIconUrl, pwaManifestUrl, shouldOpenCompanyInstallPage } from "@/lib/pwa/metadata";
import { pwaRouteInfo } from "@/lib/pwa/routes";
import { isPublicIpv4, renderCompanyIcon } from "@/lib/pwa/logoImage";
import sharp from "sharp";

jest.mock("@/lib/pwa/serverBranding", () => ({ getPwaBranding: jest.fn() }));
const brand = { id: "company-a", slug: "company-a", companyName: "Company A", logoUrl: "https://example.com/logo.png", primaryColor: "#f21f07" };
function response() {
  return { status: jest.fn().mockReturnThis(), setHeader: jest.fn(), json: jest.fn(), send: jest.fn(), end: jest.fn() };
}
beforeEach(() => { jest.clearAllMocks(); (getPwaBranding as jest.Mock).mockResolvedValue(brand); });

test("company manifest uses a real tenant launch path and same-origin square PNG endpoints", async () => {
  const res = response();
  await handler({ method: "GET", query: { slug: "company-a" } } as never, res as never);
  expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/manifest+json; charset=utf-8");
  const manifest = JSON.parse(res.send.mock.calls[0][0]);
  expect(manifest).toMatchObject({ name: "Company A", id: "/pwa/company-a", start_url: "/company-a/login", scope: "/", display: "standalone", theme_color: "#f21f07" });
  expect(manifest.background_color).toBe("#f21f07");
  expect(manifest.icons).toEqual([192, 512].map(size => expect.objectContaining({ src: expect.stringContaining(`/api/pwa/icon?slug=company-a&size=${size}`), sizes: `${size}x${size}`, type: "image/png", purpose: "any" })));
});
test("generic apps keep the neutral launch background when no company color exists", () => {
  expect(buildPwaManifest(null).background_color).toBe("#f8fafc");
  expect(buildPwaManifest({ ...brand, primaryColor: "invalid" }).background_color).toBe("#f8fafc");
});
test("company install prompts open the server-rendered branded install page", () => {
  expect(shouldOpenCompanyInstallPage(false, "company-a")).toBe(true);
  expect(shouldOpenCompanyInstallPage(true, "company-a")).toBe(false);
  expect(shouldOpenCompanyInstallPage(false, undefined)).toBe(false);
});
test("HEAD has manifest headers without a JSON body", async () => {
  const res = response(); await handler({ method: "HEAD", query: {} } as never, res as never);
  expect(res.end).toHaveBeenCalled(); expect(res.send).not.toHaveBeenCalled();
});
test.each(["../other", "https://example.com", ["company-a", "company-b"]])("rejects invalid tenant selectors: %s", async slug => {
  const res = response(); await handler({ method: "GET", query: { slug } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(400); expect(getPwaBranding).not.toHaveBeenCalled();
});
test("unknown and unavailable companies never silently install another brand", async () => {
  (getPwaBranding as jest.Mock).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("offline"));
  for (const status of [404, 503]) {
    const res = response(); await handler({ method: "GET", query: { slug: "company-a" } } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(status); expect(res.send).not.toHaveBeenCalled();
  }
});
test("logo updates change icon URLs but retain app identity; companies remain distinct", () => {
  const changed = { ...brand, logoUrl: "https://example.com/new.png" };
  expect(pwaIconUrl(changed, 512)).not.toBe(pwaIconUrl(brand, 512));
  expect(pwaManifestUrl(changed)).toBe(pwaManifestUrl(brand));
  expect(buildPwaManifest(changed).id).toBe(buildPwaManifest(brand).id);
  expect(buildPwaManifest({ ...brand, slug: "company-b" }).id).not.toBe(buildPwaManifest(brand).id);
});
test("company renames refresh icon URLs without changing the manifest location or app identity", () => {
  const renamed = { ...brand, companyName: "Spatt Braii Delivery Company" };
  const manifest = buildPwaManifest(renamed);
  expect(manifest.name).toBe("Spatt Braii Delivery Company");
  expect(manifest.short_name).toBe("Spatt Braii Delivery Company");
  expect(pwaManifestUrl(renamed)).toBe(pwaManifestUrl(brand));
  expect(pwaIconUrl(renamed, 192)).not.toBe(pwaIconUrl(brand, 192));
  expect(manifest.id).toBe(buildPwaManifest(brand).id);
});
test.each(["/company-a/login", "/company-a/client/login", "/company-a/account/settings", "/company-a/team-portal/driver/dashboard", "/auth/install?company=company-a"]) ("install metadata is enabled before or after auth on %s", path => {
  expect(pwaRouteInfo(path).enabled).toBe(true);
});
test("public marketing stays outside the install shell", () => { expect(pwaRouteInfo("/pricing").enabled).toBe(false); });
test.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "224.0.0.1", "::1"])("icon downloads refuse internal address %s", address => {
  expect(isPublicIpv4(address)).toBe(false);
});
test("a rectangular company logo renders as actual square PNGs without cropping", async () => {
  const input = await sharp({ create: { width: 220, height: 208, channels: 4, background: "#f21f07" } }).png().toBuffer();
  for (const size of [180, 192, 512]) {
    const output = await renderCompanyIcon(`data:image/png;base64,${input.toString("base64")}`, size);
    expect(await sharp(output).metadata()).toMatchObject({ width: size, height: size, format: "png", hasAlpha: false });
  }
});
test("companies without uploaded logos still get distinct branded app icons", async () => {
  const first = await renderCompanyIcon(null, 192, "Spatt Braii Delivery Company", "#0d6b58");
  const second = await renderCompanyIcon(null, 192, "North Shore Catering", "#2451c7");
  expect(await sharp(first).metadata()).toMatchObject({ width: 192, height: 192, format: "png" });
  expect(first.equals(second)).toBe(false);
});
test("the icon endpoint generates a tenant icon when no logo is uploaded", async () => {
  (getPwaBranding as jest.Mock).mockResolvedValueOnce({ ...brand, logoUrl: null });
  const res = response();
  await iconHandler({ method: "GET", query: { slug: "company-a", size: "192", v: "tenant" } } as never, res as never);
  expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
  expect(Buffer.isBuffer(res.send.mock.calls[0][0])).toBe(true);
});
