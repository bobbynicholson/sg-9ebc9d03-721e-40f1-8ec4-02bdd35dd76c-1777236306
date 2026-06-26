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
 * PlatformNav also uses this shared palette so the global admin surface
 * does not reintroduce a separate fixed gold/orange sidebar treatment.
 *
 * The full class strings are written out as literals here (not built
 * at runtime) so Tailwind's JIT scanner generates them at build time.
 */
export const BRAND_PORTAL_PALETTE = {
  accentGradient: "from-brand-primary via-brand-secondary to-brand-accent",
  accentGradientDark: "from-brand-primary via-brand-secondary to-brand-accent",
  hoverClasses:
    "hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:bg-brand-primary/10",
  activeHoverClasses:
    "hover:from-brand-primary hover:via-brand-secondary hover:to-brand-accent",
  // Light text on the brand gradient header. White-with-alpha reads
  // correctly on any brand hue (the old text-amber-100 assumed amber).
  mobileSubtitleClasses: "text-white/80",
  searchAccent:
    "bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary",
} as const;

/** Brand gradient for the mobile quick-action tiles. */
export const BRAND_ACCENT = "from-brand-primary via-brand-secondary to-brand-accent";

/**
 * Role palettes.
 *
 * The team portals intentionally share the same admin-controlled palette.
 * Primary leads navigation chrome. Secondary/accent still appear in the
 * brand gradient and quick actions, but day-to-day active/hover/search
 * states are not driven by the accent token.
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
