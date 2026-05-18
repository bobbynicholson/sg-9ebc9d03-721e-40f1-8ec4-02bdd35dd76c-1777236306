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

export interface BrandingRow {
  id: string;
  companyName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
}

export const DEFAULT_PALETTE: { primary: string; secondary: string; accent: string } = {
  primary: "#2563eb",
  secondary: "#7c3aed",
  accent: "#f59e0b",
};

export const DEFAULT_ORG_NAME = "CateringMS";

// Convert "#f59e0b" / "#fff" -> "245 158 11". Returns null on bad input
// so the caller can fall back without poisoning the CSS variable.
const hexToRgbTriplet = (hex: string | null | undefined): string | null => {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
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
}
