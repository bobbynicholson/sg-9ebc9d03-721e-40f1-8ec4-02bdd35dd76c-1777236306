/**
 * Quote-number checks for the import preview (/api/imports/[id]/preview).
 *
 * quotes.quote_number is unique per company. Without these checks a
 * number used twice in one file inserted once and then failed on the
 * unique index, and a number already on file was only skipped at commit
 * with no word in the preview.
 */
export interface QuotePreviewRow {
  id: string;
  target: string;
  status: "pending" | "skipped" | "error";
  errorMessage: string | null;
  warnings: string[];
  mapped: Record<string, any>;
}

export const QUOTE_ON_FILE_WARNING = "quote_number: a quote with this number is already on file; this row will be skipped";

const quoteNumberOf = (row: QuotePreviewRow) => String(row.mapped.quote_number ?? "").trim();

/**
 * Mark every later copy of a quote number within the file as an error
 * naming the first row. Returns the distinct numbers left to check
 * against existing quotes. Mutates the rows.
 */
export function flagRepeatedQuoteNumbers(
  rows: QuotePreviewRow[],
  lineOf: (id: string) => number | null,
): string[] {
  const firstLine = new Map<string, number | null>();
  for (const row of rows) {
    if (row.status === "error" || row.target !== "quotes") continue;
    const qn = quoteNumberOf(row);
    if (!qn) continue;
    if (!firstLine.has(qn)) {
      firstLine.set(qn, lineOf(row.id));
      continue;
    }
    row.status = "error";
    row.errorMessage = `Same quote number as row ${firstLine.get(qn) ?? "?"} in this file. Change the number, or skip this row`;
  }
  return [...firstLine.keys()];
}

/** Warn on rows whose quote number the company already has. Mutates the rows. */
export function flagQuoteNumbersOnFile(rows: QuotePreviewRow[], onFile: Set<string>): number {
  let flagged = 0;
  for (const row of rows) {
    if (row.status === "error" || row.target !== "quotes") continue;
    if (onFile.has(quoteNumberOf(row))) {
      row.warnings.push(QUOTE_ON_FILE_WARNING);
      flagged += 1;
    }
  }
  return flagged;
}
