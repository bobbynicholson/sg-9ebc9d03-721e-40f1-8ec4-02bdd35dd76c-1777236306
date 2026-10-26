/** @jest-environment node */
import { mergeBrandingRow, setBrandingRow } from "@/lib/branding/store";

const savedBrand = {
  id: "tenant-1",
  slug: "spit-braai-delivery",
  companyName: "Spit Braai Delivery",
  logoUrl: "https://example.com/brand.png",
  primaryColor: "#0d6b58",
  secondaryColor: "#24473e",
  accentColor: "#f5a623",
  fontBody: null,
  fontDisplay: null,
};

beforeEach(() => setBrandingRow(savedBrand));
afterEach(() => setBrandingRow(null));

test("a company rename preserves its slug, logo, and palette for the live PWA metadata", () => {
  expect(mergeBrandingRow({ id: savedBrand.id, companyName: "Spatt Braii Delivery" })).toEqual({
    ...savedBrand,
    companyName: "Spatt Braii Delivery",
  });
});

test("an explicit logo removal remains a removal when merging a branding change", () => {
  expect(mergeBrandingRow({ id: savedBrand.id, logoUrl: null })).toEqual({
    ...savedBrand,
    logoUrl: null,
  });
});
