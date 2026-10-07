/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spreadsheet parsing for the importer (/api/imports/upload). Kept out of
 * the API route so the file-shape rules can be unit tested on real
 * workbook buffers.
 */
import * as XLSX from "xlsx";

export interface ParsedSheet {
  name: string;
  rows: Array<{ rowIndex: number; data: Record<string, any> }>;
}

/**
 * Strip leading characters that some spreadsheet apps interpret as
 * formula starts (=, +, -, @). Defensive against operators uploading
 * a CSV that, if later re-exported, would let an attacker inject a
 * payload. Only applied to string values; numbers / dates pass
 * through untouched.
 */
export function sanitiseCell(value: any): any {
  if (typeof value !== "string") return value;
  if (value.length === 0) return value;
  if (/^[=+\-@]/.test(value)) return "'" + value;
  return value;
}
/** A header cell that is really a value: an email or a phone-length number. */
export function looksLikeDataCell(h: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)
    || (/^\+?[\d\s()-]+$/.test(h) && h.replace(/\D/g, "").length >= 9);
}

/** One sheet as found in the file: unique headers and the data rows. */
export interface SheetTable {
  name: string;
  headers: string[];
  /** Data rows, aligned with `headers`; values as read (strings mostly). */
  rows: any[][];
  /** File line number (1-based) of each entry in `rows`. */
  lines: number[];
}

/**
 * Read every sheet into header + row tables. Shared by the server upload
 * route and the browser importer (/admin/onboarding/clients), so both
 * treat a file the same way:
 *   - real Excel date cells become ISO yyyy-mm-dd (their US "m/d/yy"
 *     text was read day-first, swapping day and month)
 *   - title rows above the headers are passed over
 *   - no header row (first line is a client) -> "Column 1".. headers
 *   - unnamed columns -> "Column N", repeated names -> "Name (2)"
 *   - blank rows skipped, file line numbers kept
 * Accepts a Node Buffer or a browser ArrayBuffer / Uint8Array.
 */
export function readSheetTables(data: ArrayBuffer | Uint8Array): SheetTable[] {
  // Cast XLSX usage to any - SheetJS' BufferLike type widens between
  // releases, and we don't want our build to chase that.
  const X = XLSX as any;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = X.read(bytes, { type: "array", cellDates: true, raw: false });
  const tables: SheetTable[] = [];
  for (const sheetName of wb.SheetNames as string[]) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    // Real Excel date cells are rewritten as ISO yyyy-mm-dd. Their
    // display text is often US "m/d/yy", which the date normaliser
    // reads day-first, silently swapping day and month (4 March
    // became 3 April).
    for (const addr of Object.keys(ws)) {
      const cell = ws[addr];
      if (addr[0] === "!" || !cell || cell.t !== "d" || !(cell.v instanceof Date)) continue;
      const d: Date = cell.v;
      if (Number.isNaN(d.getTime())) continue;
      // SheetJS builds the Date at local midnight; read local parts.
      const pad = (n: number) => String(n).padStart(2, "0");
      cell.w = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    // header: 1 returns rows as arrays so we can build clean headers
    // ourselves. Avoids SheetJS auto-coercion that loses leading zeros
    // in IDs. blankrows stays on so array positions match file lines;
    // empty rows are skipped below.
    const aoa: any[][] = X.utils.sheet_to_json(ws, {
      header: 1, defval: "", raw: false, blankrows: true,
    });
    const isBlank = (r: any[] | undefined) => !r || r.every((v) => v == null || String(v).trim() === "");
    const width = Math.max(0, ...aoa.map((r) => (r as any[]).length));
    if (width === 0) continue;
    // Header row: the first of the top 10 rows with 2+ filled cells.
    // Title / export-date rows above the real headers (one cell) are
    // passed over instead of becoming the headers.
    const filled = (r: any[]) => r.filter((v) => v != null && String(v).trim() !== "").length;
    let headerAt = aoa.findIndex((r, i) => i < 10 && filled(r as any[]) >= Math.min(2, width));
    if (headerAt < 0) headerAt = aoa.findIndex((r) => !isBlank(r as any[]));
    if (headerAt < 0) continue;
    const rawHeaders = Array.from({ length: width }, (_, i) => String((aoa[headerAt] as any[])[i] ?? "").trim());
    // No header row: the first line already holds a client (an email or a
    // phone-length number). Name the columns "Column 1".. and keep that
    // line as data, otherwise the first record silently became headers.
    const firstRowIsData = rawHeaders.some((h) => looksLikeDataCell(h));
    // Unnamed columns become "Column N" and repeated names get " (2)",
    // so no column with data is dropped or overwritten.
    const seen = new Map<string, number>();
    const headers = rawHeaders.map((h, i) => {
      const base = firstRowIsData || !h ? `Column ${i + 1}` : h;
      const n = (seen.get(base.toLowerCase()) || 0) + 1;
      seen.set(base.toLowerCase(), n);
      return n === 1 ? base : `${base} (${n})`;
    });
    const rows: any[][] = [];
    const lines: number[] = [];
    for (let i = firstRowIsData ? headerAt : headerAt + 1; i < aoa.length; i++) {
      const r = aoa[i] as any[];
      // Skip rows that are entirely empty - common at the end of
      // sheets that someone deleted contents but not the row.
      if (isBlank(r)) continue;
      rows.push(headers.map((_, idx) => r[idx]));
      lines.push(i + 1);
    }
    tables.push({ name: sheetName, headers, rows, lines });
  }
  return tables;
}

export function parseWorkbook(buffer: ArrayBuffer | Uint8Array, filename: string): ParsedSheet[] {
  const sheets: ParsedSheet[] = readSheetTables(buffer).map((t) => ({
    name: t.name,
    rows: t.rows.map((r, i) => {
      const data: Record<string, any> = {};
      t.headers.forEach((h, idx) => {
        const v = r[idx];
        // Sanitise then trim. Order matters - the formula-prefix check
        // works on the raw value; trimming after preserves the leading
        // apostrophe escape we may have added.
        data[h] = v == null ? null : typeof v === "string" ? sanitiseCell(v.trim()) : v;
      });
      return { rowIndex: t.lines[i], data };
    }),
  }));
  // CSVs come back as a single sheet - if SheetJS decided to call
  // it "Sheet1" but the upload was a .csv, rename to a tidier label.
  if (filename.toLowerCase().endsWith(".csv") && sheets.length === 1 && sheets[0].name === "Sheet1") {
    sheets[0].name = "Data";
  }
  return sheets;
}
