export type BrandPalette = {
  primary: string;
  secondary: string;
  accent: string;
};

export type PaletteContrast = {
  primary: number | null;
  secondary: number | null;
  accent: number | null;
};

export type PaletteSuggestion = BrandPalette & {
  rationale: string;
  contrast: PaletteContrast;
  source: "ai" | "automatic";
};

const HEX_RE = /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/;
const MIN_WHITE_TEXT_CONTRAST = 4.5;

export function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const raw = String(hex).trim();
  if (!HEX_RE.test(raw)) return null;
  let h = raw.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toUpperCase()}`;
}

export function hexToRgb(hex: string | null | undefined): [number, number, number] | null {
  const normal = normalizeHex(hex);
  if (!normal) return null;
  const h = normal.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function componentToHex(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase();
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixRgb(a: [number, number, number], b: [number, number, number], amount: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

export function ensureContrastWithWhite(hex: string, minContrast = MIN_WHITE_TEXT_CONTRAST): string {
  const normal = normalizeHex(hex);
  const rgb = hexToRgb(normal);
  if (!normal || !rgb) return "#1F2937";
  const ratio = contrastRatio(normal, "#FFFFFF");
  if (ratio != null && ratio >= minContrast) return normal;

  for (let i = 1; i <= 95; i += 1) {
    const candidate = rgbToHex(mixRgb(rgb, [0, 0, 0], i / 100));
    const candidateRatio = contrastRatio(candidate, "#FFFFFF");
    if (candidateRatio != null && candidateRatio >= minContrast) return candidate;
  }

  return "#111827";
}

export function paletteContrast(palette: BrandPalette): PaletteContrast {
  return {
    primary: contrastRatio(palette.primary, "#FFFFFF"),
    secondary: contrastRatio(palette.secondary, "#FFFFFF"),
    accent: contrastRatio(palette.accent, "#FFFFFF"),
  };
}

export function palettePassesWhiteTextContrast(palette: BrandPalette): boolean {
  const ratios = paletteContrast(palette);
  return [ratios.primary, ratios.secondary, ratios.accent]
    .every((ratio) => ratio != null && ratio >= MIN_WHITE_TEXT_CONTRAST);
}

export function automaticPaletteSuggestion(palette: BrandPalette): PaletteSuggestion {
  const safe = {
    primary: ensureContrastWithWhite(palette.primary),
    secondary: ensureContrastWithWhite(palette.secondary),
    accent: ensureContrastWithWhite(palette.accent),
  };
  return {
    ...safe,
    contrast: paletteContrast(safe),
    source: "automatic",
    rationale: "Adjusted any colour that could not carry white button text while preserving the original hue as closely as possible.",
  };
}

function saturation([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Treat the three inputs as "admin-selected colours", not fixed roles.
 * Pick the strongest readable colour for primary actions, a second
 * readable colour for gradients, and the most distinct remaining colour
 * for accent highlights.
 */
export function arrangePaletteSuggestion(palette: BrandPalette): PaletteSuggestion {
  const entries = [
    ensureContrastWithWhite(palette.primary),
    ensureContrastWithWhite(palette.secondary),
    ensureContrastWithWhite(palette.accent),
  ]
    .map((hex, index) => ({
      hex,
      index,
      rgb: hexToRgb(hex) || [0, 0, 0] as [number, number, number],
      contrast: contrastRatio(hex, "#FFFFFF") ?? 0,
    }))
    .filter((entry, index, all) => all.findIndex((x) => x.hex === entry.hex) === index);

  while (entries.length < 3) {
    entries.push({
      hex: ["#1F2937", "#7C2D12", "#0F766E"][entries.length],
      index: entries.length,
      rgb: hexToRgb(["#1F2937", "#7C2D12", "#0F766E"][entries.length]) || [0, 0, 0],
      contrast: contrastRatio(["#1F2937", "#7C2D12", "#0F766E"][entries.length], "#FFFFFF") ?? 0,
    });
  }

  const primaryEntry = [...entries].sort((a, b) => b.contrast - a.contrast)[0];
  const remaining = entries.filter((entry) => entry.hex !== primaryEntry.hex);
  const accentEntry = [...remaining].sort((a, b) => saturation(b.rgb) - saturation(a.rgb))[0];
  const secondaryEntry = remaining.find((entry) => entry.hex !== accentEntry.hex) || remaining[0];

  const arranged = {
    primary: primaryEntry.hex,
    secondary: secondaryEntry.hex,
    accent: accentEntry.hex,
  };

  return {
    ...arranged,
    contrast: paletteContrast(arranged),
    source: "automatic",
    rationale: "Arranged the selected colours so the strongest readable colour drives actions, the next supports gradients, and the most vivid remaining colour becomes the accent.",
  };
}
