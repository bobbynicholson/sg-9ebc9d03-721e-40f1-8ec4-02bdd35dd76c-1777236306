/** Keep small text panels/rows intact, but always allow unusually long text
 * to flow. This conservative bound uses the narrowest expected text measure
 * and counts explicit newlines too; it never locks an entire list or course.
 * Sixteen lines leave ample room within a full A4 content area.
 */
export function canKeepPdfTextTogether(value: string | null | undefined, charactersPerLine = 40): boolean {
  const lines = String(value || "").split(/\r?\n/);
  return lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0) <= 16;
}
