/**
 * Curated white-label font catalogue.
 *
 * Tenants pick a body font and a display/heading font from this list in
 * the white-label admin. We store the plain family `name` on
 * `companies.brand_font_body / brand_font_display`, then at runtime:
 *   1. set --brand-font-body / --brand-font-display CSS vars (the
 *      Tailwind font-body / font-display utilities + the global body
 *      rule read these, falling back to the next/font defaults), and
 *   2. inject a Google Fonts <link> for the chosen families.
 *
 * Curated (not free-text) so we only ever load known, license-clean
 * Google Fonts and can build a valid stylesheet URL. An unknown/legacy
 * value resolves to null here and the default font is used.
 */

export type FontCategory = "sans" | "serif";

export interface BrandFont {
  /** Stored value + CSS family name (must match the Google family). */
  name: string;
  /** Human label for the picker. */
  label: string;
  category: FontCategory;
  /** CSS fallback stack appended after the family. */
  fallback: string;
  /** Weights to request from Google Fonts. */
  weights: number[];
}

const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif";
const SERIF_FALLBACK = "ui-serif, Georgia, Cambria, serif";

/**
 * The catalogue. Body picker shows all; display picker shows all too -
 * a tenant may want a sans display or a serif body. Kept deliberately
 * tight (popular, well-hinted families) so the dropdown stays usable.
 */
export const BRAND_FONTS: BrandFont[] = [
  { name: "Inter", label: "Inter (default body)", category: "sans", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Poppins", label: "Poppins", category: "sans", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Montserrat", label: "Montserrat", category: "sans", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Work Sans", label: "Work Sans", category: "sans", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Nunito", label: "Nunito", category: "sans", fallback: SANS_FALLBACK, weights: [400, 600, 700, 800] },
  { name: "Lato", label: "Lato", category: "sans", fallback: SANS_FALLBACK, weights: [400, 700, 900] },
  { name: "Raleway", label: "Raleway", category: "sans", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "DM Sans", label: "DM Sans", category: "sans", fallback: SANS_FALLBACK, weights: [400, 500, 700] },
  { name: "Manrope", label: "Manrope", category: "sans", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Fraunces", label: "Fraunces (default display)", category: "serif", fallback: SERIF_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Playfair Display", label: "Playfair Display", category: "serif", fallback: SERIF_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Merriweather", label: "Merriweather", category: "serif", fallback: SERIF_FALLBACK, weights: [400, 700] },
  { name: "Lora", label: "Lora", category: "serif", fallback: SERIF_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "Cormorant", label: "Cormorant", category: "serif", fallback: SERIF_FALLBACK, weights: [400, 500, 600, 700] },
  { name: "DM Serif Display", label: "DM Serif Display", category: "serif", fallback: SERIF_FALLBACK, weights: [400] },
];

const BY_NAME = new Map(BRAND_FONTS.map((f) => [f.name, f]));

/** Resolve a stored family name to a known font, or null if unknown. */
export function lookupBrandFont(name: string | null | undefined): BrandFont | null {
  if (!name) return null;
  return BY_NAME.get(name) ?? null;
}

/** Full CSS font-family value (quoted family + fallback) for a name. */
export function fontFamilyValue(name: string | null | undefined): string | null {
  const f = lookupBrandFont(name);
  if (!f) return null;
  return `'${f.name}', ${f.fallback}`;
}

/**
 * Build a single Google Fonts css2 stylesheet URL for the given family
 * names (deduped, unknowns dropped). Returns null when nothing to load.
 */
export function googleFontsHref(names: Array<string | null | undefined>): string | null {
  const fonts: BrandFont[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const f = lookupBrandFont(n);
    if (f && !seen.has(f.name)) {
      seen.add(f.name);
      fonts.push(f);
    }
  }
  if (fonts.length === 0) return null;
  const families = fonts
    .map((f) => {
      const wght = [...f.weights].sort((a, b) => a - b).join(";");
      return `family=${encodeURIComponent(f.name)}:wght@${wght}`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
