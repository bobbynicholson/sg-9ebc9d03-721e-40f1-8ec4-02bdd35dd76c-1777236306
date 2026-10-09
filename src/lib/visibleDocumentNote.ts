const LEGACY_IMPORT_MARKERS = [
  "Imported from legacy source PDF",
  "Source SHA-256:",
  "Source mode:",
];

export function visibleDocumentNote(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  let markerIndex = -1;
  for (const marker of LEGACY_IMPORT_MARKERS) {
    const index = value.toLowerCase().indexOf(marker.toLowerCase());
    if (index >= 0 && (markerIndex < 0 || index < markerIndex)) markerIndex = index;
  }
  if (markerIndex < 0) return value;

  const visiblePrefix = value.slice(0, markerIndex)
    .replace(/(^|\n)\s*A NOTE FROM US\s*(?=\n|$)/i, "$1")
    .trim();
  return visiblePrefix || null;
}