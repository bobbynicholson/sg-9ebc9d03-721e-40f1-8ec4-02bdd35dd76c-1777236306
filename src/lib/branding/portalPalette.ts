/**
 * Shared brand-driven palette for tenant-facing portal chrome
 * (tenant admin + the team portals: driver, kitchen, cleaning,
 * shopping).
 *
 * These map to the `brand-*` Tailwind utilities, which resolve at
 * runtime to the tenant's CSS variables (--brand-primary /
 * -secondary / -accent) set by TenantBrandingApplier from the
 * `companies.primary_color / secondary_color / accent_color`
 * columns. For tenants who never white-label, those vars fall back
 * to the CateringMS amber defaults (see src/lib/branding/applyBranding.ts),
 * so non-customised portals look exactly as they did before.
 *
 * IMPORTANT: keep this as the single source of the portal accent.
 * The previous regression came from each nav config hardcoding its
 * own `from-amber-500 to-orange-500` strings, which silently pinned
 * every tenant's admin to the platform palette. Spread this constant
 * instead of re-typing colour classes.
 *
 * The platform / super-admin chrome (PlatformNav) intentionally does
 * NOT use this - it stays on the fixed amber reference palette,
 * because it's the SaaS owner's own product surface, not a tenant's.
 *
 * The full class strings are written out as literals here (not built
 * at runtime) so Tailwind's JIT scanner generates them at build time.
 */
export const BRAND_PORTAL_PALETTE = {
  accentGradient: "from-brand-primary via-brand-secondary to-brand-accent",
  accentGradientDark: "from-brand-primary via-brand-secondary to-brand-accent",
  hoverClasses:
    "hover:bg-brand-accent/10 hover:text-brand-accent dark:hover:bg-brand-accent/10",
  activeHoverClasses:
    "hover:from-brand-primary hover:via-brand-secondary hover:to-brand-accent",
  // Light text on the brand gradient header. White-with-alpha reads
  // correctly on any brand hue (the old text-amber-100 assumed amber).
  mobileSubtitleClasses: "text-white/80",
  searchAccent:
    "bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent",
} as const;

/** Brand gradient for the mobile quick-action tiles. */
export const BRAND_ACCENT = "from-brand-primary via-brand-secondary to-brand-accent";

/**
 * Role palettes.
 *
 * The team portals intentionally share the same admin-controlled palette.
 * That keeps kitchen / driver / shopping / cleaning consistent while still
 * drawing from all three tenant tokens, so tenants whose primary and
 * secondary are close together do not end up with a one-colour interface.
 *
 * Keep these class strings as full literals (no runtime interpolation) so
 * Tailwind's JIT scanner emits every brand-* utility.
 */
// UNIFIED (2026-06-25): Raj wants ONE consistent admin-controlled palette
// across every portal/role, not hardcoded role colours. Use the full tenant
// palette (primary -> secondary -> accent) everywhere so a company whose
// primary/secondary are both green does not get a green-only interface.
export const KITCHEN_PORTAL_PALETTE = BRAND_PORTAL_PALETTE;
export const KITCHEN_ACCENT = BRAND_ACCENT;

export const DRIVER_PORTAL_PALETTE = BRAND_PORTAL_PALETTE;
export const DRIVER_ACCENT = BRAND_ACCENT;

export const SHOPPING_PORTAL_PALETTE = BRAND_PORTAL_PALETTE;
export const SHOPPING_ACCENT = BRAND_ACCENT;

export const CLEANING_PORTAL_PALETTE = BRAND_PORTAL_PALETTE;
export const CLEANING_ACCENT = BRAND_ACCENT;
