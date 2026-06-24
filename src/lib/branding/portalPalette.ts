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
  accentGradient: "from-brand-primary to-brand-secondary",
  accentGradientDark: "from-brand-primary to-brand-secondary",
  hoverClasses:
    "hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:bg-brand-primary/10",
  activeHoverClasses: "hover:from-brand-primary hover:to-brand-secondary",
  // Light text on the brand gradient header. White-with-alpha reads
  // correctly on any brand hue (the old text-amber-100 assumed amber).
  mobileSubtitleClasses: "text-white/80",
  searchAccent:
    "bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary",
} as const;

/** Brand gradient for the mobile quick-action tiles. */
export const BRAND_ACCENT = "from-brand-primary to-brand-secondary";

/**
 * Per-portal palettes (Wave 71).
 *
 * Every team portal used to spread the SAME BRAND_PORTAL_PALETTE, so the
 * kitchen / driver / shopping / cleaning rails were visually identical -
 * all "primary -> secondary" (the tenant's green for Spit Braai). Operators
 * who jump between portals had no colour cue for which surface they're on.
 *
 * To give each portal its own identity WITHOUT leaving the tenant's theme,
 * each one leads with a different one of the three brand tokens and pairs it
 * with another, so the colours are always combinations of the SAME theme
 * (--brand-primary / -secondary / -accent), never invented hues:
 *
 *   admin    primary -> secondary   (owner surface, the "main" brand)
 *   kitchen  primary -> secondary   (solid green - keeps its identity)
 *   shopping primary -> accent      (green, gold tail)
 *   driver   accent  -> accent      (SOLID GOLD - its own identity)
 *   cleaning accent  -> primary     (gold, teal tail)
 *
 * For a tenant like Spit Braai whose primary and secondary are nearly the
 * same teal, the only two truly different hues are that teal and the gold
 * accent. The four combinations above still read as four distinct surfaces:
 * solid teal (kitchen), teal->gold (shopping), solid gold (driver),
 * gold->teal (cleaning). Driver leads with the accent so it is unmistakably
 * the GOLD portal, not another green one - and its PAGES use `brand-accent`
 * for chrome to match (see the driver pages). Kitchen/shopping lead with
 * `brand-primary`; driver/cleaning lead with `brand-accent`.
 *
 * For a tenant who customises all three colours these read as four distinct
 * portals; for a tenant on the amber defaults they stay a harmonious warm
 * set. The class strings are full literals (no runtime interpolation) so
 * Tailwind's JIT scanner still emits every brand-* utility - same rule that
 * applies to BRAND_PORTAL_PALETTE above.
 */
export const KITCHEN_PORTAL_PALETTE = BRAND_PORTAL_PALETTE;
export const KITCHEN_ACCENT = BRAND_ACCENT;

// driver - SOLID GOLD (accent). Its own identity, clearly not green.
// Driver PAGES also lead with `brand-accent` to match this nav.
export const DRIVER_PORTAL_PALETTE = {
  accentGradient: "from-brand-accent to-brand-accent",
  accentGradientDark: "from-brand-accent to-brand-accent",
  hoverClasses:
    "hover:bg-brand-accent/10 hover:text-brand-accent dark:hover:bg-brand-accent/10",
  activeHoverClasses: "hover:from-brand-accent hover:to-brand-accent",
  mobileSubtitleClasses: "text-white/80",
  searchAccent:
    "bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent",
} as const;
export const DRIVER_ACCENT = "from-brand-accent to-brand-accent";

// shopping - GREEN with a gold tail (primary -> accent). Leads primary,
// so shopping pages keep using `brand-primary`.
export const SHOPPING_PORTAL_PALETTE = {
  accentGradient: "from-brand-primary to-brand-accent",
  accentGradientDark: "from-brand-primary to-brand-accent",
  hoverClasses:
    "hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:bg-brand-primary/10",
  activeHoverClasses: "hover:from-brand-primary hover:to-brand-accent",
  mobileSubtitleClasses: "text-white/80",
  searchAccent:
    "bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary",
} as const;
export const SHOPPING_ACCENT = "from-brand-primary to-brand-accent";

// cleaning - GOLD with a teal tail (accent -> primary). Leads accent.
export const CLEANING_PORTAL_PALETTE = {
  accentGradient: "from-brand-accent to-brand-primary",
  accentGradientDark: "from-brand-accent to-brand-primary",
  hoverClasses:
    "hover:bg-brand-accent/10 hover:text-brand-accent dark:hover:bg-brand-accent/10",
  activeHoverClasses: "hover:from-brand-accent hover:to-brand-primary",
  mobileSubtitleClasses: "text-white/80",
  searchAccent:
    "bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent",
} as const;
export const CLEANING_ACCENT = "from-brand-accent to-brand-primary";
