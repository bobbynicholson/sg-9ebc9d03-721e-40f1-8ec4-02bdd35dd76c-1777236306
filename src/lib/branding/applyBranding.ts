/**
 * Per-tenant white-label DOM application.
 *
 * Source of truth: `companies` row (id, company_name, logo_url,
 * primary_color, secondary_color, accent_color). Writes to white-label
 * always go to that table directly - there is no parallel state object.
 *
 * This module is the small set of pure helpers that translate a row
 * into CSS variables on `document.documentElement`. The applier
 * component in `src/components/TenantBrandingApplier.tsx` owns the
 * fetch + dispatch lifecycle on top.
 */
import { fontFamilyValue, googleFontsHref } from "./fonts";

export interface BrandingRow {
  id: string;
  companyName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  /** White-label body font family name (Google Fonts), null = default. */
  fontBody?: string | null;
  /** White-label display/heading font family name, null = default. */
  fontDisplay?: string | null;
}

// Default theme for users/tenants WITHOUT custom branding - the warm
// CateringMS amber set on the landing + auth pages, so the whole product
// reads as one brand by default. White-label tenants still override this.
export const DEFAULT_PALETTE: { primary: string; secondary: string; accent: string } = {
  primary: "#d97706", // amber-600
  secondary: "#ea580c", // orange-600
  accent: "#f59e0b", // amber-500
};

export const DEFAULT_ORG_NAME = "CateringMS";

// Convert "#f59e0b" / "#fff" to RGB. Returns null on bad input so the
// caller can fall back without poisoning CSS variables.
const hexToRgbTuple = (hex: string | null | undefined): [number, number, number] | null => {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

// Convert "#f59e0b" / "#fff" -> "245 158 11" for Tailwind rgb vars.
const hexToRgbTriplet = (hex: string | null | undefined): string | null => {
  const rgb = hexToRgbTuple(hex);
  return rgb ? rgb.join(" ") : null;
};

// Convert a brand hex to shadcn's HSL token format: "37 92% 50%".
const hexToHslTriplet = (hex: string | null | undefined): string | null => {
  const rgb = hexToRgbTuple(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const foregroundForHex = (hex: string | null | undefined): string => {
  const rgb = hexToRgbTuple(hex);
  if (!rgb) return "0 0% 100%";
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? "222.2 47.4% 11.2%" : "0 0% 100%";
};

export function isWhiteLabelRow(row: BrandingRow | null): boolean {
  return !!row
    && row.id !== "default"
    && !!row.companyName
    && row.companyName !== DEFAULT_ORG_NAME;
}

export function applyBrandingToDOM(row: BrandingRow | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const primary = row?.primaryColor || DEFAULT_PALETTE.primary;
  const secondary = row?.secondaryColor || DEFAULT_PALETTE.secondary;
  const accent = row?.accentColor || DEFAULT_PALETTE.accent;

  // Hex variables remain the source of truth for inline styles
  // (e.g. linear-gradient backgrounds in AdminNav).
  root.style.setProperty("--brand-primary", primary);
  root.style.setProperty("--brand-secondary", secondary);
  root.style.setProperty("--brand-accent", accent);
  // RGB-triplet variants drive the Tailwind alpha-aware utilities
  // (bg-brand-primary/10, text-brand-secondary/80). Without these every
  // brand-* class collapses to nothing once an alpha modifier is added.
  root.style.setProperty("--brand-primary-rgb",   hexToRgbTriplet(primary)   ?? "37 99 235");
  root.style.setProperty("--brand-secondary-rgb", hexToRgbTriplet(secondary) ?? "124 58 237");
  root.style.setProperty("--brand-accent-rgb",    hexToRgbTriplet(accent)    ?? "245 158 11");

  // Also drive the shadcn theme tokens. Older components use
  // bg-primary / text-primary / ring instead of the newer brand-* utilities;
  // without syncing these, company-admin branding only reached part of the UI.
  root.style.setProperty("--primary", hexToHslTriplet(primary) ?? "37 92% 50%");
  root.style.setProperty("--primary-foreground", foregroundForHex(primary));
  root.style.setProperty("--ring", hexToHslTriplet(primary) ?? "37 92% 50%");
  root.style.setProperty("--sidebar-primary", hexToHslTriplet(primary) ?? "37 92% 50%");
  root.style.setProperty("--sidebar-primary-foreground", foregroundForHex(primary));
  root.style.setProperty("--sidebar-ring", hexToHslTriplet(accent) ?? hexToHslTriplet(primary) ?? "37 92% 50%");

  // Typography. The tailwind font-body / font-display utilities and the
  // global `body` rule read --brand-font-* with a fallback to the
  // next/font defaults, so clearing the var restores Inter / Fraunces.
  const bodyFamily = fontFamilyValue(row?.fontBody);
  const displayFamily = fontFamilyValue(row?.fontDisplay);
  if (bodyFamily) root.style.setProperty("--brand-font-body", bodyFamily);
  else root.style.removeProperty("--brand-font-body");
  if (displayFamily) root.style.setProperty("--brand-font-display", displayFamily);
  else root.style.removeProperty("--brand-font-display");
}

// Idempotent <link> id for the tenant Google Fonts stylesheet.
const BRAND_FONTS_LINK_ID = "brand-fonts-link";

/**
 * Inject (or update / remove) the Google Fonts stylesheet for the
 * tenant's chosen families. Separate from applyBrandingToDOM because it
 * touches <head> (network) rather than just CSS vars; the applier calls
 * both together. No-op on the server.
 */
export function loadBrandFonts(row: BrandingRow | null): void {
  if (typeof document === "undefined") return;
  const href = googleFontsHref([row?.fontBody, row?.fontDisplay]);
  const existing = document.getElementById(BRAND_FONTS_LINK_ID) as HTMLLinkElement | null;
  if (!href) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }
  const link = document.createElement("link");
  link.id = BRAND_FONTS_LINK_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}
