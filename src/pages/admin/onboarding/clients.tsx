/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding/clients - the easy client-list importer.
 *
 * Three steps on one page:
 *   1. Upload a CSV / TSV / Excel file or paste rows.
 *   2. Match columns: every source column gets a target field, pre-filled
 *      from known header names; "Match with AI" asks the server to match
 *      the rest from the headers + 3 sample rows. Every match is editable.
 *   3. Review rows: problems are listed with their row and file line
 *      number; clicking one scrolls to and focuses the cell to fix.
 *      Valid rows import through /api/onboarding/clients/bulk.
 *
 * The file is parsed in the browser. Only headers and three sample rows
 * are sent for AI matching; nothing is saved until Import is pressed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { cn } from "@/lib/utils";
import {
  Upload, ArrowLeft, FileSpreadsheet, ClipboardPaste, CheckCircle2,
  AlertTriangle, Trash2, Loader2, Users, Download, Sparkles, X, ArrowDown, Filter, ChevronLeft, ChevronRight, Wrench,
} from "lucide-react";
import { PortalShell, PortalHeader, PageWorkbench } from "@/components/portal/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RawRow = {
  name?: string; surname?: string; email?: string; phone?: string; mobile_number?: string; landline_number?: string; notes?: string;
  client_type?: string; tax_number?: string;
  billing_address_line1?: string; billing_address_line2?: string;
  billing_city?: string; billing_postal_code?: string;
  payment_terms?: string; credit_limit?: string; tags?: string;
  historical_total_events?: string; historical_lifetime_spend?: string;
  historical_last_event_date?: string; historical_last_event_type?: string;
  historical_notes?: string;
};
type FieldKey = keyof RawRow;

/** Target fields offered in the column matcher, in display order. */
const FIELDS: Array<{ key: FieldKey; label: string; group: "Main" | "Billing" | "History" }> = [
  { key: "name", label: "Name", group: "Main" },
  { key: "surname", label: "Surname", group: "Main" },
  { key: "email", label: "Email", group: "Main" },
  { key: "phone", label: "Phone", group: "Main" },
  { key: "mobile_number", label: "Mobile", group: "Main" },
  { key: "landline_number", label: "Landline", group: "Main" },
  { key: "notes", label: "Notes", group: "Main" },
  { key: "client_type", label: "Client type", group: "Main" },
  { key: "tags", label: "Tags", group: "Main" },
  { key: "tax_number", label: "VAT / tax number", group: "Billing" },
  { key: "billing_address_line1", label: "Address line 1", group: "Billing" },
  { key: "billing_address_line2", label: "Address line 2", group: "Billing" },
  { key: "billing_city", label: "City", group: "Billing" },
  { key: "billing_postal_code", label: "Postal code", group: "Billing" },
  { key: "payment_terms", label: "Payment terms (days)", group: "Billing" },
  { key: "credit_limit", label: "Credit limit", group: "Billing" },
  { key: "historical_total_events", label: "Past events (count)", group: "History" },
  { key: "historical_lifetime_spend", label: "Lifetime spend", group: "History" },
  { key: "historical_last_event_date", label: "Last event date", group: "History" },
  { key: "historical_last_event_type", label: "Last event type", group: "History" },
  { key: "historical_notes", label: "History notes", group: "History" },
];
const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<FieldKey, string>;
/** Columns shown as editable cells in the review table. */
const TABLE_FIELDS: FieldKey[] = ["name", "surname", "email", "phone", "notes"];

type Issue = { field: FieldKey; message: string };

interface PreviewRow extends RawRow {
  /** Local UI-only id for keys + row removal. */
  _key: string;
  /** Line number in the source file (header = line 1), when known. */
  _line: number | null;
  /** File or "Pasted rows" the row came from. */
  _source: string;
  issues: Issue[];
}

/** How each source column is used. */
type ColumnChoice = {
  target: FieldKey | "skip";
  /** "name" = matched by header name, "ai" = suggested by AI, "manual" = set by you. */
  via: "name" | "ai" | "manual" | "none";
  confidence?: number;
  reason?: string;
};

/** A loaded file waiting for its columns to be matched. */
/** Largest file read in the browser, and the bulk endpoint's per-upload cap. */
const MAX_FILE_MB = 10;
const MAX_IMPORT_ROWS = 5000;

interface SheetTable { name: string; headers: string[]; rows: string[][] }

interface PendingBatch {
  /** Changes every time a new table is staged; stale AI replies are ignored. */
  id: number;
  source: string;
  /** Excel only: every non-empty sheet, so the operator can switch. */
  sheets?: SheetTable[];
  sheetName?: string;
  headers: string[];
  rows: string[][];
  /** Treat the first row as data instead of headers. */
  firstRowIsData: boolean;
  columns: ColumnChoice[];
}

function looksLikeEmail(v: string) {
  return /^\S+@\S+\.\S+$/.test(v.trim().toLowerCase());
}
function looksLikePhone(v: string) {
  // Loose check - the API does the real normalisation. We just want
  // to flag rows that are clearly missing digits.
  const digits = v.replace(/[^\d]/g, "");
  return digits.length >= 7;
}
/** Re-check every row, including emails repeated within the staged list. */
function withIssues<T extends RawRow & { issues: Issue[] }>(list: T[]): T[] {
  const firstByEmail = new Map<string, number>();
  return list.map((r, i) => {
    const issues = rowIssues(r);
    const email = (r.email || "").trim().toLowerCase();
    if (email && looksLikeEmail(email)) {
      const first = firstByEmail.get(email);
      if (first === undefined) firstByEmail.set(email, i);
      else issues.push({ field: "email", message: `Same email as row ${first + 1}` });
    }
    return { ...r, issues };
  });
}

function rowIssues(r: RawRow): Issue[] {
  const out: Issue[] = [];
  const fullName = [(r.name || "").trim(), (r.surname || "").trim()].filter(Boolean).join(" ").trim();
  if (!fullName) out.push({ field: "name", message: "Name is missing" });
  if (!r.email || !r.email.trim()) out.push({ field: "email", message: "Email is missing" });
  else if (!looksLikeEmail(r.email)) out.push({ field: "email", message: "Email looks invalid" });
  if (r.phone && !looksLikePhone(r.phone)) out.push({ field: "phone", message: "Phone is too short" });
  return out;
}

/**
 * Detect which input column maps to name / surname / email / phone.
 * Forgiving on common header spellings.
 */
function pickHeaderMap(headers: string[]): {
  name: number; surname: number; email: number; phone: number; mobile_number: number; landline_number: number; notes: number;
  client_type: number; tax_number: number; billing_address_line1: number;
  billing_address_line2: number; billing_city: number; billing_postal_code: number;
  payment_terms: number; credit_limit: number; tags: number;
  historical_total_events: number; historical_lifetime_spend: number;
  historical_last_event_date: number; historical_last_event_type: number; historical_notes: number;
} {
  const idx = (candidates: string[]) => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().trim().replace(/\s*\*\s*$/, "");
      if (candidates.includes(h)) return i;
    }
    return -1;
  };
  return {
    name:    idx(["name", "client name", "client_name", "first name", "firstname", "first_name", "given name", "full name", "fullname", "full_name", "client", "customer", "customer name", "account name", "contact", "contact name", "company", "company name"]),
    surname: idx(["surname", "last name", "lastname", "last_name", "family name", "family_name"]),
    email:   idx(["email", "e-mail", "e_mail", "mail", "email address", "email_address", "e-mail address", "emailaddress", "email id"]),
    phone:   idx(["phone", "tel", "telephone", "phone number", "tel number", "phone no", "contact number", "number"]),
    mobile_number: idx(["mobile", "mobile_number", "cell", "cellphone", "cell number", "mobile number", "cell phone", "whatsapp"]),
    landline_number: idx(["landline", "landline_number", "office", "office phone", "home phone"]),
    notes:   idx(["notes", "note", "comments", "comment", "memo", "remarks", "remark"]),
    client_type: idx(["client type", "client_type", "type"]),
    tax_number: idx(["tax / vat number", "tax_number", "vat", "vat number", "tax id"]),
    billing_address_line1: idx(["billing address (line 1)", "billing_address_line1", "address", "address 1", "street"]),
    billing_address_line2: idx(["billing address (line 2)", "billing_address_line2", "address 2", "suburb"]),
    billing_city: idx(["city", "billing city", "billing_city", "town"]),
    billing_postal_code: idx(["postal code", "billing postal code", "billing_postal_code", "postcode", "zip"]),
    payment_terms: idx(["payment terms (days)", "payment_terms", "terms", "net days", "due days"]),
    credit_limit: idx(["credit limit (r)", "credit_limit", "credit"]),
    tags: idx(["tags (comma-separated)", "tags", "labels", "categories"]),
    historical_total_events: idx(["total events (history)", "historical_total_events", "total events", "event count", "events booked", "lifetime events", "past events"]),
    historical_lifetime_spend: idx(["lifetime spend (r)", "historical_lifetime_spend", "lifetime spend", "total spent", "lifetime value", "ltv", "total revenue"]),
    historical_last_event_date: idx(["last event date (history)", "historical_last_event_date", "last event", "most recent event", "last booking", "last function"]),
    historical_last_event_type: idx(["last event type (history)", "historical_last_event_type", "last event type", "last booking type"]),
    historical_notes: idx(["history notes", "historical_notes", "client history", "previous notes"]),
  };
}

/** Initial column choices from known header names (no AI). */
function columnsByName(headers: string[]): ColumnChoice[] {
  const map = pickHeaderMap(headers) as Record<FieldKey, number>;
  const out: ColumnChoice[] = headers.map(() => ({ target: "skip", via: "none" }));
  (Object.keys(map) as FieldKey[]).forEach((field) => {
    const idx = map[field];
    if (idx >= 0 && out[idx].target === "skip") out[idx] = { target: field, via: "name" };
  });
  // "phone" falls back to mobile/landline in the old matcher; keep that
  // by leaving those columns on their own fields - phone is filled below.
  return out;
}

/** Positional guess for files without a header row. */
function columnsByPosition(count: number): ColumnChoice[] {
  const order: FieldKey[] = ["name", "surname", "email", "phone", "notes"];
  return Array.from({ length: count }, (_, i) =>
    i < order.length ? { target: order[i], via: "name" as const } : { target: "skip" as const, via: "none" as const });
}

/** Build preview rows for a batch using its column choices. */
function rowsFromBatch(batch: PendingBatch): PreviewRow[] {
  const dataRows = batch.firstRowIsData ? [batch.headers, ...batch.rows] : batch.rows;
  const firstLine = batch.firstRowIsData ? 1 : 2;
  const out: PreviewRow[] = [];
  dataRows.forEach((cells, i) => {
    if (!cells.some((c) => String(c ?? "").trim() !== "")) return;
    const r: RawRow = {};
    batch.columns.forEach((c, col) => {
      if (c.target === "skip") return;
      const v = String(cells[col] ?? "").trim();
      if (v && !r[c.target]) r[c.target] = v;
    });
    // Same fallback as before: phone comes from mobile, then landline.
    if (!r.phone) r.phone = r.mobile_number || r.landline_number || "";
    out.push({
      ...r,
      _key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      _line: firstLine + i,
      _source: batch.source,
      issues: rowIssues(r),
    });
  });
  return out;
}

/**
 * Parse a CSV string. Handles quoted fields with commas inside, but
 * we keep this small + dependency-free. Pasted data from Excel /
 * Numbers / Sheets typically arrives as TSV (tabs); we also handle
 * that.
 */
function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { headers: [], rows: [] };

  // Detect tab or comma. Tabs win when the first line has any.
  const firstLine = trimmed.split(/\r?\n/, 1)[0] || "";
  // Tabs (pasted from a spreadsheet) win; semicolons when they outnumber
  // commas (Excel's CSV export in many locales); otherwise commas.
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = firstLine.includes("\t") ? "\t" : count(";") > count(",") ? ";" : ",";

  const lines: string[][] = [];
  let inQuotes = false;
  let cur = "";
  let row: string[] = [];

  const pushCell = () => { row.push(cur); cur = ""; };
  const pushRow = () => { lines.push(row); row = []; };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (trimmed[i + 1] === "\"") { cur += "\""; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === "\"") inQuotes = true;
      else if (ch === delim) pushCell();
      else if (ch === "\n") { pushCell(); pushRow(); }
      else if (ch === "\r") { /* skip */ }
      else cur += ch;
    }
  }
  pushCell();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) pushRow();

  if (lines.length === 0) return { headers: [], rows: [] };
  const [headers, ...rest] = lines;
  return { headers: headers.map((h) => h.trim()), rows: rest };
}

type AiDecision = { index: number; target: string; confidence: number; rationale: string };

/** Merge AI suggestions into the current choices: manual picks win, then
 *  AI, then name matches; one column per field. */
function mergeAi(columns: ColumnChoice[], decisions: AiDecision[]): ColumnChoice[] {
  const merged = columns.map((c, i) => {
    if (c.via === "manual") return c;
    const d = decisions.find((x) => x.index === i);
    if (!d || d.target === "skip" || !(d.target in FIELD_LABEL)) return c.via === "name" ? c : { target: "skip" as const, via: "none" as const };
    return { target: d.target as FieldKey, via: "ai" as const, confidence: d.confidence, reason: d.rationale };
  });
  const seen = new Set<string>();
  return merged.map((c) => {
    if (c.target === "skip") return c;
    if (seen.has(c.target)) return { target: "skip" as const, via: "none" as const };
    seen.add(c.target);
    return c;
  });
}

/** Confidence needed before an AI match is accepted without review. */
const AUTO_ACCEPT_CONFIDENCE = 0.75;

/** True when a batch can go straight to the review list. */
function canAutoAccept(columns: ColumnChoice[]): boolean {
  const has = (k: FieldKey) => columns.some((c) => c.target === k);
  return (has("name") || has("surname")) && has("email")
    && columns.every((c) => c.via !== "ai" || (c.confidence ?? 0) >= AUTO_ACCEPT_CONFIDENCE);
}

/** True when some column with data is still unmatched (worth asking AI). */
function hasUnmatchedData(batch: PendingBatch): boolean {
  const rows = batch.firstRowIsData ? [batch.headers, ...batch.rows] : batch.rows;
  return batch.columns.some((c, col) => c.target === "skip" && rows.slice(0, 20).some((r) => String(r[col] ?? "").trim() !== ""));
}

function ProtectedClientImport() {
  // OWNER admitted alongside the admin tier: the API allowlist in
  // /api/onboarding/clients/bulk already includes owner and the
  // owner-facing setup wizard links here, so gating them out of the
  // page was a 403 on a flow they are supposed to run on day one.
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ClientImportPage />
    </ProtectedRoute>
  );
}
export default ProtectedClientImport;

function ClientImportPage() {
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [pending, setPendingState] = useState<PendingBatch | null>(null);
  const setPending = (next: PendingBatch | null | ((p: PendingBatch | null) => PendingBatch | null)) => {
    setPendingState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      pendingRef.current = value;
      return value;
    });
  };
  const [aiBusy, setAiBusy] = useState(false);
  const batchSeq = useRef(0);
  const pendingRef = useRef<PendingBatch | null>(null);
  const lastBatch = useRef<{ batch: PendingBatch; keys: string[] } | null>(null);
  const [autoAccepted, setAutoAccepted] = useState<null | { source: string; count: number; via: "ai" | "name" }>(null);
  const aiAbort = useRef<AbortController | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  // Persistent failure banner. The destructive toast auto-dismisses,
  // and the staged rows stay on screen after a failed POST, so with
  // only the toast an operator who looked away had no way to tell the
  // import never happened.
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    imported: number; skipped: number; rejected: number; total: number;
    commsPausedDays: number;
  }>(null);
  // Where the staged rows came from - sent as `filename` so the row
  // in Imports History reads "clients.xlsx" instead of "(unnamed file)".
  const [sourceName, setSourceName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => aiAbort.current?.abort(), []);

  /** Start column matching for a freshly loaded table. */
  const stageTable = (source: string, headers: string[], body: string[][], sheets?: SheetTable[], sheetName?: string, autoAdvance = true) => {
    aiAbort.current?.abort();
    const cleanHeaders = headers.map((h) => String(h ?? "").trim());
    const byName = columnsByName(cleanHeaders);
    // Treat the first row as data only when it looks like data (an email,
    // a phone-length number or a date) - unfamiliar header names alone
    // don't mean there is no header row; AI or the operator can match them.
    const firstRowLooksLikeData = cleanHeaders.some((h) =>
      looksLikeEmail(h) || h.replace(/[^\d]/g, "").length >= 7 || /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(h));
    const noHeaderMatch = byName.every((c) => c.target === "skip") && firstRowLooksLikeData;
    batchSeq.current += 1;
    const batch: PendingBatch = {
      id: batchSeq.current,
      source,
      sheets,
      sheetName,
      headers: cleanHeaders,
      rows: body.map((r) => r.map((c) => String(c ?? ""))),
      firstRowIsData: noHeaderMatch,
      columns: noHeaderMatch ? columnsByPosition(cleanHeaders.length) : byName,
    };
    setPending(batch);
    setAiNote(null);
    setResult(null);
    setAutoAccepted(null);
    // Everything recognised by name already: no AI call needed.
    if (autoAdvance && !hasUnmatchedData(batch) && canAutoAccept(batch.columns)) {
      commitBatch(batch, "name");
      return;
    }
    void matchWithAi(batch, autoAdvance);
  };

  /** Turn a matched batch into review rows. */
  const commitBatch = (batch: PendingBatch, via: "ai" | "name" | "manual") => {
    const built = rowsFromBatch(batch);
    setRows((prev) => withIssues([...prev, ...built]));
    setSourceName((prev) => prev || batch.source);
    lastBatch.current = { batch, keys: built.map((r) => r._key) };
    setPending(null);
    setAiNote(null);
    setAutoAccepted(via === "manual" ? null : { source: batch.source, count: built.length, via });
    toast({
      title: `${built.length} row${built.length === 1 ? "" : "s"} ready to review`,
      description: via === "manual"
        ? "Check the list below, then import."
        : "Columns were matched automatically. Check the list, then import.",
    });
  };

  /** Re-open column matching for the last auto-matched file. */
  const changeLastMatches = () => {
    const last = lastBatch.current;
    if (!last) return;
    const keys = new Set(last.keys);
    setRows((prev) => withIssues(prev.filter((r) => !keys.has(r._key))));
    lastBatch.current = null;
    setAutoAccepted(null);
    setPending(last.batch);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        throw new Error(`That file is over ${MAX_FILE_MB} MB. Split it into smaller files and import them one at a time.`);
      }
      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        const text = await file.text();
        const { headers, rows: body } = parseDelimited(text);
        if (headers.length === 0) throw new Error("The file is empty");
        stageTable(file.name, headers, body);
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX: any = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        // Read every sheet that has data; start on the first one.
        const sheets: SheetTable[] = (wb.SheetNames as string[])
          .map((name) => {
            const data: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false });
            const rowsOnly = data
              .map((r) => (Array.isArray(r) ? r : []).map((c) => String(c ?? "")))
              .filter((r) => r.some((c) => c.trim() !== ""));
            const [headers = [], ...rows] = rowsOnly;
            return { name, headers, rows };
          })
          .filter((t) => t.headers.length > 0);
        if (sheets.length === 0) throw new Error("The spreadsheet has no data.");
        stageTable(file.name, sheets[0].headers, sheets[0].rows, sheets.length > 1 ? sheets : undefined, sheets[0].name);
      } else {
        throw new Error("Unsupported file type. Use CSV, TSV or XLSX.");
      }
    } catch (e: any) {
      toast({ title: "Couldn't read that file", description: e?.message || "", variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onPaste = () => {
    if (!pasted.trim()) {
      toast({ title: "Nothing to paste", description: "Drop your spreadsheet rows in the box first." });
      return;
    }
    const { headers, rows: body } = parseDelimited(pasted);
    if (headers.length === 0) {
      toast({ title: "Nothing to read", description: "The pasted text has no rows." });
      return;
    }
    stageTable("Pasted rows", headers, body);
    setPasted("");
  };

  const setColumn = (col: number, target: FieldKey | "skip") => {
    setPending((p) => {
      if (!p) return p;
      const columns = p.columns.map((c, i) => {
        if (i === col) return { target, via: "manual" as const };
        // One column per field: free the field from any other column.
        if (target !== "skip" && c.target === target) return { target: "skip" as const, via: "manual" as const };
        return c;
      });
      return { ...p, columns };
    });
  };

  const switchSheet = (name: string) => {
    const t = pending?.sheets?.find((x) => x.name === name);
    if (!pending || !t) return;
    stageTable(pending.source, t.headers, t.rows, pending.sheets, t.name, false);
  };

  const toggleFirstRowIsData = () => {
    setPending((p) => {
      if (!p) return p;
      const firstRowIsData = !p.firstRowIsData;
      return {
        ...p,
        firstRowIsData,
        columns: firstRowIsData ? columnsByPosition(p.headers.length) : columnsByName(p.headers),
      };
    });
    setAiNote(null);
  };

  const matchWithAi = async (batchArg?: PendingBatch, autoAdvance = false) => {
    const batch = batchArg ?? pending;
    if (!batch || (!batchArg && aiBusy)) return;
    const batchId = batch.id;
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 40_000);
    setAiBusy(true);
    setAiNote(null);
    // Fallback when AI can't help: accept the name matches if they are enough.
    const acceptByNameOrExplain = (message: string) => {
      const latest = pendingRef.current;
      if (!latest || latest.id !== batchId) return;
      if (autoAdvance && canAutoAccept(latest.columns) && latest.columns.every((c) => c.via !== "manual")) {
        commitBatch(latest, "name");
        return;
      }
      setAiNote(message);
    };
    try {
      const headers = batch.firstRowIsData ? batch.headers.map((_, i) => `Column ${i + 1}`) : batch.headers;
      const samples = (batch.firstRowIsData ? [batch.headers, ...batch.rows] : batch.rows)
        .filter((r) => r.some((c) => c.trim() !== ""))
        .slice(0, 3);
      const r = await fetch("/api/onboarding/clients/map-columns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headers, sampleRows: samples }),
        signal: controller.signal,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          r.status === 401 ? "Your session has expired. Sign in again to use AI matching."
            : r.status === 403 ? "Only owners and admins can use AI matching."
              : j?.error || "AI matching is unavailable right now. Match the columns by hand.",
        );
      }
      const decisions = (Array.isArray(j.mapping) ? j.mapping : []) as AiDecision[];
      const latest = pendingRef.current;
      // A different file or sheet was loaded while AI was working.
      if (!latest || latest.id !== batchId) return;
      const merged = { ...latest, columns: mergeAi(latest.columns, decisions) };
      const touchedByHand = latest.columns.some((c) => c.via === "manual");
      if (autoAdvance && !touchedByHand && canAutoAccept(merged.columns)) {
        commitBatch(merged, "ai");
        return;
      }
      setPending(merged);
      const matched = merged.columns.filter((c) => c.target !== "skip").length;
      const low = merged.columns.filter((c) => c.via === "ai" && (c.confidence ?? 0) < AUTO_ACCEPT_CONFIDENCE).length;
      setAiNote(matched === 0
        ? "AI couldn't match any column with confidence. Choose them from the dropdowns."
        : !canAutoAccept(merged.columns) && !merged.columns.some((c) => c.target === "email")
          ? `AI matched ${matched} column${matched === 1 ? "" : "s"}, but no email column was found. Pick it below, then continue.`
          : low > 0
            ? `AI matched ${matched} column${matched === 1 ? "" : "s"}; ${low} ${low === 1 ? "is" : "are"} uncertain (amber). Check them, then continue.`
            : `AI matched ${matched} column${matched === 1 ? "" : "s"}. Check the suggestions, then continue.`);
    } catch (e: any) {
      if (batchSeq.current !== batchId) return;
      acceptByNameOrExplain(e?.name === "AbortError"
        ? "AI matching took too long. Try again, or match the columns by hand."
        : e instanceof TypeError
          ? "Couldn't reach the server. Check your connection and try again."
          : e?.message || "AI matching is unavailable right now. Match the columns by hand.");
    } finally {
      window.clearTimeout(timer);
      if (aiAbort.current === controller) aiAbort.current = null;
      setAiBusy(false);
    }
  };

  const addPendingRows = () => {
    if (!pending) return;
    if (!pending.columns.some((c) => c.target !== "skip")) {
      toast({ title: "Match at least one column", description: "Choose which field each column holds." });
      return;
    }
    commitBatch(pending, "manual");
  };

  const editCell = (key: string, field: FieldKey, val: string) => {
    setRows((prev) => withIssues(prev.map((r) => (r._key === key ? { ...r, [field]: val } : r))));
  };
  const removeRow = (key: string) => setRows((prev) => withIssues(prev.filter((r) => r._key !== key)));
  const clearAll = () => { setRows([]); setResult(null); setSourceName(null); setOnlyProblems(false); setAutoAccepted(null); lastBatch.current = null; };

  const counts = useMemo(() => {
    const ok = rows.filter((r) => r.issues.length === 0).length;
    const bad = rows.length - ok;
    return { ok, bad };
  }, [rows]);
  const problemRows = useMemo(() => rows.filter((r) => r.issues.length > 0), [rows]);
  const visibleRows = onlyProblems ? problemRows : rows;

  /** Scroll to a row, flash it and focus its first problem cell. */
  const goToRow = (key: string) => {
    const row = rows.find((r) => r._key === key);
    const el = document.getElementById(`import-row-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashKey(key);
    window.setTimeout(() => setFlashKey((k) => (k === key ? null : k)), 1800);
    const field = row?.issues.find((i) => TABLE_FIELDS.includes(i.field))?.field || "name";
    window.setTimeout(() => {
      (document.getElementById(`import-cell-${key}-${field}`) as HTMLInputElement | null)?.focus();
    }, 350);
  };
  // ---- Resolve mode: fix problem rows one at a time ----------------------
  const [resolveKey, setResolveKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<RawRow>({});
  const [showMoreFields, setShowMoreFields] = useState(false);
  const resolveRow = resolveKey ? rows.find((r) => r._key === resolveKey) || null : null;
  /** Issues for the draft, including duplicates against the other rows. */
  const draftIssues = useMemo<Issue[]>(() => {
    if (!resolveRow) return [];
    const list = rows.map((r) => (r._key === resolveRow._key ? { ...r, ...draft } : r));
    return withIssues(list).find((r) => r._key === resolveRow._key)?.issues || [];
  }, [rows, draft, resolveRow]);
  const draftBad = new Set(draftIssues.map((i) => i.field));

  const openResolve = (key?: string) => {
    const target = key ? rows.find((r) => r._key === key) : problemRows[0];
    if (!target) return;
    const fields: RawRow = {};
    FIELDS.forEach((f) => { fields[f.key] = target[f.key] || ""; });
    setDraft(fields);
    setShowMoreFields(FIELDS.some((f) => f.group !== "Main" && (target[f.key] || "").trim() !== ""));
    setResolveKey(target._key);
  };
  /** Problem rows other than the one being edited, in list order. */
  const queue = problemRows.filter((r) => r._key !== resolveKey);
  const resolvePosition = resolveRow ? problemRows.findIndex((r) => r._key === resolveRow._key) : -1;

  const saveDraft = () => {
    if (!resolveRow) return;
    const key = resolveRow._key;
    setRows((prev) => withIssues(prev.map((r) => (r._key === key ? { ...r, ...draft } : r))));
    return draftIssues.length === 0;
  };
  const saveAndNext = () => {
    const fixed = saveDraft();
    // Next problem after this one, wrapping to the start.
    const after = problemRows.slice(resolvePosition + 1).find((r) => r._key !== resolveKey)
      || problemRows.find((r) => r._key !== resolveKey);
    if (after) {
      openResolve(after._key);
    } else {
      setResolveKey(null);
      toast({
        title: fixed ? "All rows fixed" : "Saved",
        description: fixed ? "Every row is ready to import." : "This row still needs a fix; it stays flagged in the list.",
      });
    }
  };
  const goPrevious = () => {
    saveDraft();
    const before = [...problemRows.slice(0, Math.max(0, resolvePosition))].reverse().find((r) => r._key !== resolveKey);
    if (before) openResolve(before._key);
  };
  const removeFromResolve = () => {
    if (!resolveRow) return;
    const key = resolveRow._key;
    const nextRow = queue.find((r, i) => i >= resolvePosition) || queue[0];
    removeRow(key);
    if (nextRow) openResolve(nextRow._key); else setResolveKey(null);
  };

  const nextProblem = () => {
    if (problemRows.length === 0) return;
    const active = document.activeElement?.closest("[data-row-key]")?.getAttribute("data-row-key");
    const idx = problemRows.findIndex((r) => r._key === active);
    goToRow(problemRows[(idx + 1) % problemRows.length]._key);
  };
  const rowNumber = useMemo(() => new Map(rows.map((r, i) => [r._key, i + 1])), [rows]);

  const submit = async () => {
    if (rows.length === 0) return;
    const valid = rows.filter((r) => r.issues.length === 0);
    if (valid.length === 0) {
      toast({ title: "Nothing to import", description: "Every row has an issue. Fix the highlighted cells first." });
      return;
    }
    if (valid.length > MAX_IMPORT_ROWS) {
      toast({
        title: "Too many rows for one import",
        description: `Up to ${MAX_IMPORT_ROWS.toLocaleString()} clients can import at once. Remove some rows or split the file.`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setResult(null);
    setImportError(null);
    try {
      const r = await fetch("/api/onboarding/clients/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // The API stores `filename` as the import job's source name;
          // without it every batch shows "(unnamed file)" in history.
          filename: sourceName,
          rows: valid.map((v) => ({
            name: v.name, surname: v.surname, email: v.email, phone: v.phone,
            mobile_number: v.mobile_number, landline_number: v.landline_number, notes: v.notes,
            client_type: v.client_type, tax_number: v.tax_number,
            billing_address_line1: v.billing_address_line1,
            billing_address_line2: v.billing_address_line2,
            billing_city: v.billing_city, billing_postal_code: v.billing_postal_code,
            payment_terms: v.payment_terms, credit_limit: v.credit_limit, tags: v.tags,
            historical_total_events: v.historical_total_events,
            historical_lifetime_spend: v.historical_lifetime_spend,
            historical_last_event_date: v.historical_last_event_date,
            historical_last_event_type: v.historical_last_event_type,
            historical_notes: v.historical_notes,
          })),
        }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok) {
        throw new Error(
          r.status === 401 ? "Your session has expired. Sign in again; your rows are still here."
            : j?.error || `The server could not import the rows (error ${r.status}). Your rows are still staged below.`,
        );
      }
      setResult({
        imported: j.imported, skipped: j.skipped, rejected: j.rejected, total: j.total,
        commsPausedDays: Number(j.comms_paused_for_days) || 0,
      });
      toast({
        title: `${j.imported} client${j.imported === 1 ? "" : "s"} imported`,
        description: j.skipped
          ? `${j.skipped} already on file, skipped.`
          : "All clean, straight in.",
      });
      // Rows with problems stay staged so they can still be fixed and imported.
      setRows((prev) => prev.filter((p) => p.issues.length > 0));
      setSourceName((prev) => (counts.bad > 0 ? prev : null));
    } catch (e: any) {
      const msg = e instanceof TypeError
        ? "Couldn't reach the server. Check your connection; your rows are still staged below."
        : e?.message || "The import did not go through. Your rows are still staged below.";
      setImportError(msg);
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingPreview = pending
    ? (pending.firstRowIsData ? [pending.headers, ...pending.rows] : pending.rows).filter((r) => r.some((c) => c.trim() !== ""))
    : [];
  const mappedCount = pending ? pending.columns.filter((c) => c.target !== "skip").length : 0;
  const pendingHasName = !!pending?.columns.some((c) => c.target === "name" || c.target === "surname");
  const pendingHasEmail = !!pending?.columns.some((c) => c.target === "email");

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Import clients - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Import clients"
            subtitle="Upload any client list (CSV or Excel). Columns are matched automatically; check the rows, fix anything flagged, then import. Existing clients with the same email are skipped."
            icon={Users}
            meta={
              rows.length > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {rows.length} row{rows.length === 1 ? "" : "s"} staged
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {counts.ok} ready
                  </span>
                  {counts.bad > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      {counts.bad} need a fix
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <Link href={withSlug("/admin/onboarding/imports")}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to imports
                </Button>
              </Link>
            }
          />
          <PageWorkbench />

          {/* Step indicator */}
          <ol className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            {[
              { n: 1, label: "Upload or paste", active: !pending && rows.length === 0 },
              { n: 2, label: "Match columns", active: !!pending },
              { n: 3, label: "Fix and import", active: !pending && rows.length > 0 },
            ].map((s, i) => (
              <li key={s.n} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-6 bg-slate-300" aria-hidden="true" />}
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                  s.active ? "border-brand-primary/30 bg-brand-primary/10 text-brand-primary" : "border-slate-200 bg-white",
                )}>
                  <span className="tabular-nums">{s.n}</span> {s.label}
                </span>
              </li>
            ))}
          </ol>

          {!pending && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* File drop */}
              <Card className="border-2 border-dashed border-brand-primary/20 bg-white">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <FileSpreadsheet className="w-5 h-5 text-brand-primary" />
                    <h2 className="font-semibold text-slate-900">Upload a file</h2>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    CSV, TSV or Excel in any column layout. Columns are matched automatically; you only check unclear ones.
                  </p>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.xls,.xlsx,.txt"
                    onChange={(e) => onFile(e.target.files?.[0] || null)}
                    className="cursor-pointer"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    <a
                      href="/api/imports/templates/clients"
                      download="cateringms-clients-import-template.xlsx"
                      className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                    >
                      <Download className="w-3 h-3" /> Excel template
                    </a>
                    <a
                      href="/api/imports/templates/clients?format=csv"
                      download="cateringms-clients-import-template.csv"
                      className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                    >
                      <Download className="w-3 h-3" /> CSV template
                    </a>
                    <a
                      href="/api/imports/templates/clients?format=txt"
                      download="cateringms-clients-import-column-guide.txt"
                      className="inline-flex items-center gap-1 text-slate-600 hover:underline"
                    >
                      <Download className="w-3 h-3" /> Column guide
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Paste */}
              <Card className="border-2 border-dashed border-slate-200 bg-white">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardPaste className="w-5 h-5 text-slate-500" />
                    <h2 className="font-semibold text-slate-900">Or paste from a spreadsheet</h2>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    Copy cells from Excel, Sheets or Numbers and paste them here, with or without a header row.
                  </p>
                  <textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder="Name	Surname	Email	Phone&#10;John	Doe	john@example.co.za	082 333 4444"
                    rows={5}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                  <Button onClick={onPaste} variant="outline" className="mt-2 w-full">
                    <ClipboardPaste className="w-4 h-4 mr-2" />
                    Continue with pasted rows
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: column matching */}
          {pending && (
            <Card className="mb-6">
              <CardContent className="p-4 lg:p-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">Match columns · {pending.source}{pending.sheets && pending.sheetName ? ` · ${pending.sheetName}` : ""}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {pendingPreview.length} data row{pendingPreview.length === 1 ? "" : "s"} · {mappedCount} of {pending.columns.length} columns matched.
                      Choose what each column holds, or let AI suggest it.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void matchWithAi()} disabled={aiBusy}>
                      {aiBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4 text-brand-primary" />}
                      {aiBusy ? "Matching..." : "Match with AI"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { aiAbort.current?.abort(); setPending(null); setAiNote(null); }}>
                      <X className="mr-1 h-4 w-4" /> Cancel
                    </Button>
                  </div>
                </div>

                {pending.sheets && pending.sheets.length > 1 && (
                  <label className="mb-3 mr-6 inline-flex items-center gap-2 text-xs text-slate-600">
                    Sheet
                    <select
                      value={pending.sheetName}
                      onChange={(e) => switchSheet(e.target.value)}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                    >
                      {pending.sheets.map((t) => (
                        <option key={t.name} value={t.name}>{t.name} ({t.rows.length} rows)</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={pending.firstRowIsData} onChange={toggleFirstRowIsData} className="h-4 w-4 rounded border-slate-300" />
                  The first row is client data, not column names
                </label>

                {aiBusy && (
                  <p role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-xs text-slate-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
                    Matching your columns automatically. Clear matches go straight to the review list.
                  </p>
                )}
                {aiNote && (
                  <p role="status" className={cn("mb-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs",
                    aiNote.startsWith("AI matched") ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" /> {aiNote}
                  </p>
                )}

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Column in your file</th>
                        <th className="px-3 py-2 text-left">Sample values</th>
                        <th className="px-3 py-2 text-left">Import as</th>
                        <th className="px-3 py-2 text-left">Matched by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.columns.map((c, col) => {
                        const samples = pendingPreview.slice(0, 3).map((r) => r[col]).filter((v) => v && v.trim());
                        return (
                          <tr key={col} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {pending.firstRowIsData ? `Column ${col + 1}` : (pending.headers[col] || `Column ${col + 1}`)}
                            </td>
                            <td className="max-w-[16rem] px-3 py-2 text-xs text-slate-500">
                              {samples.length ? samples.map((s, i) => <div key={i} className="truncate">{s}</div>) : <span className="italic">empty</span>}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={c.target}
                                onChange={(e) => setColumn(col, e.target.value as FieldKey | "skip")}
                                aria-label={`Import column ${col + 1} as`}
                                className={cn(
                                  "h-9 w-full min-w-[11rem] rounded-md border bg-white px-2 text-sm",
                                  c.target === "skip" ? "border-slate-200 text-slate-400" : "border-slate-300 text-slate-900",
                                )}
                              >
                                <option value="skip">Don't import</option>
                                {(["Main", "Billing", "History"] as const).map((g) => (
                                  <optgroup key={g} label={g}>
                                    {FIELDS.filter((f) => f.group === g).map((f) => (
                                      <option key={f.key} value={f.key}>{f.label}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {c.target === "skip" ? (
                                <span className="text-slate-400">Not imported</span>
                              ) : c.via === "ai" ? (
                                <span
                                  className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                                    (c.confidence ?? 0) >= 0.75 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}
                                  title={c.reason}
                                >
                                  <Sparkles className="h-3 w-3" /> AI {Math.round((c.confidence ?? 0) * 100)}%
                                </span>
                              ) : c.via === "name" ? (
                                <span className="text-slate-600">Column name</span>
                              ) : (
                                <span className="text-slate-600">You</span>
                              )}
                              {c.via === "ai" && c.reason && <p className="mt-0.5 max-w-[14rem] text-[11px] text-slate-500">{c.reason}</p>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {!pendingHasName && <span className="mr-3 text-rose-700">Match a Name column so rows can import.</span>}
                    {!pendingHasEmail && <span className="text-rose-700">Match an Email column so rows can import.</span>}
                  </p>
                  <Button onClick={addPendingRows} className="bg-brand-primary hover:opacity-90" disabled={mappedCount === 0}>
                    Continue with {pendingPreview.length} row{pendingPreview.length === 1 ? "" : "s"} <ArrowDown className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Failed-import banner. Stays until the next attempt so the
              outcome is visible even after the toast is gone. */}
          {importError && (
            <Card className="mb-6 border-rose-200 bg-rose-50">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-rose-900">Import failed, nothing was saved</p>
                    <p className="text-xs text-rose-800/80 mt-0.5">{importError}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={submit} disabled={submitting || counts.ok === 0} className="bg-white">
                  Retry import
                </Button>
              </CardContent>
            </Card>
          )}

          {autoAccepted && !pending && rows.length > 0 && (
            <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                {autoAccepted.count} row{autoAccepted.count === 1 ? "" : "s"} from {autoAccepted.source} matched automatically
                {autoAccepted.via === "ai" ? " by AI" : " by column name"}. Check them, then import.
              </span>
              <Button variant="outline" size="sm" className="bg-white" onClick={changeLastMatches}>
                Change column matches
              </Button>
            </div>
          )}

          {/* Step 3: rows to fix */}
          {rows.length > 0 && problemRows.length > 0 && (
            <Card className="mb-4 border-rose-200">
              <CardContent className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-800">
                    <AlertTriangle className="h-4 w-4" /> {problemRows.length} row{problemRows.length === 1 ? "" : "s"} to fix
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => openResolve()} className="bg-rose-600 text-white hover:bg-rose-700">
                      <Wrench className="mr-1.5 h-3.5 w-3.5" /> Resolve {problemRows.length} row{problemRows.length === 1 ? "" : "s"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={nextProblem}>Jump to next</Button>
                    <Button
                      variant={onlyProblems ? "default" : "outline"}
                      size="sm"
                      onClick={() => setOnlyProblems((v) => !v)}
                      aria-pressed={onlyProblems}
                    >
                      <Filter className="mr-1.5 h-3.5 w-3.5" /> {onlyProblems ? "Showing rows to fix" : "Show only rows to fix"}
                    </Button>
                  </div>
                </div>
                <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                  {problemRows.map((r) => (
                    <li key={r._key}>
                      <button
                        type="button"
                        onClick={() => openResolve(r._key)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-900 hover:bg-rose-100"
                        title={`${r._source}${r._line ? `, line ${r._line}` : ""}`}
                      >
                        <span className="font-semibold tabular-nums">Row {rowNumber.get(r._key)}</span>
                        {r._line ? <span className="text-rose-700/70 tabular-nums">line {r._line}</span> : null}
                        <span>· {r.issues.map((i) => i.message).join(", ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Preview + import */}
          {rows.length > 0 && (
            <Card className="mb-6">
              <CardContent className="p-4 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">Review rows ({rows.length})</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="text-emerald-600 font-medium">{counts.ok}</span> ready to import,
                      {" "}<span className="text-rose-700 font-medium">{counts.bad}</span> need a fix. Edit any cell directly.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={clearAll} disabled={submitting}>
                      <Trash2 className="w-4 h-4 mr-1.5" /> Clear all
                    </Button>
                    <Button
                      onClick={submit}
                      disabled={submitting || counts.ok === 0}
                      className="bg-brand-primary hover:opacity-90"
                    >
                      {submitting
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                        : <><Upload className="w-4 h-4 mr-2" /> Import {counts.ok} client{counts.ok === 1 ? "" : "s"}</>
                      }
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <th className="text-left py-2 pr-3 w-16">Row</th>
                        {TABLE_FIELDS.map((f) => (
                          <th key={f} className="text-left py-2 px-2">{FIELD_LABEL[f]}</th>
                        ))}
                        <th className="text-left py-2 px-2 w-24">Status</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => {
                        const ok = r.issues.length === 0;
                        const bad = new Set(r.issues.map((i) => i.field));
                        const extra = FIELDS.filter((f) => !TABLE_FIELDS.includes(f.key) && f.key !== "phone" && r[f.key]);
                        return (
                          <tr
                            key={r._key}
                            id={`import-row-${r._key}`}
                            data-row-key={r._key}
                            className={cn(
                              "border-b border-slate-100 align-top scroll-mt-24 transition-colors",
                              ok ? "hover:bg-slate-50/70" : "bg-rose-50/50",
                              flashKey === r._key && "bg-amber-100",
                            )}
                          >
                            <td className="py-1.5 pr-3 text-xs text-slate-500">
                              <span className="font-semibold tabular-nums text-slate-700">{rowNumber.get(r._key)}</span>
                              {r._line ? <span className="block text-[10px] tabular-nums text-slate-400" title={r._source}>line {r._line}</span> : null}
                            </td>
                            {TABLE_FIELDS.map((f) => (
                              <td key={f} className="py-1.5 px-1">
                                <Input
                                  id={`import-cell-${r._key}-${f}`}
                                  value={r[f] || ""}
                                  onChange={(e) => editCell(r._key, f, e.target.value)}
                                  placeholder={f === "notes" ? "(optional)" : undefined}
                                  aria-invalid={bad.has(f) || undefined}
                                  aria-label={`Row ${rowNumber.get(r._key)} ${FIELD_LABEL[f]}`}
                                  className={cn("h-8 text-sm", bad.has(f) && "border-rose-400 bg-white focus-visible:ring-rose-400")}
                                />
                              </td>
                            ))}
                            <td className="py-1.5 px-2">
                              {/* Status pills stay SEMANTIC: emerald =
                                  good to go, rose = needs fixing. */}
                              {ok ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                                </Badge>
                              ) : (
                                <div className="space-y-0.5">
                                  <button
                                    type="button"
                                    onClick={() => openResolve(r._key)}
                                    className="inline-flex items-center rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                                    aria-label={`Resolve row ${rowNumber.get(r._key)}`}
                                  >
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Resolve
                                  </button>
                                  {r.issues.map((i) => (
                                    <p key={i.message} className="text-[11px] leading-tight text-rose-700">{i.message}</p>
                                  ))}
                                </div>
                              )}
                              {extra.length > 0 && (
                                <p className="mt-1 text-[10px] text-slate-400" title={extra.map((f) => `${f.label}: ${r[f.key]}`).join("\n")}>
                                  +{extra.length} more field{extra.length === 1 ? "" : "s"}
                                </p>
                              )}
                            </td>
                            <td className="py-1.5 px-1 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(r._key)}
                                className="text-slate-400 hover:text-rose-600"
                                title="Remove this row"
                                aria-label={`Remove row ${rowNumber.get(r._key)}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {onlyProblems && problemRows.length === 0 && (
                    <p className="py-6 text-center text-sm text-emerald-700">All rows are fixed.</p>
                  )}
                </div>
                {!pending && (
                  <p className="mt-3 text-xs text-slate-500">
                    Need more rows? <button type="button" className="font-medium text-brand-primary hover:underline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Upload another file</button> above; new rows are added to this list.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Result summary. Semantic success (emerald), and it spells
              out the auto-email quarantine: the bulk API pauses the
              system's email sequences on every fresh batch, and the
              green-light button lives on the Imports History page. */}
          {result && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-emerald-900">
                      Imported {result.imported} of {result.total}.
                    </p>
                    <p className="text-xs text-emerald-800">
                      {result.skipped > 0 && <>Skipped {result.skipped} already on file. </>}
                      {result.rejected > 0 && <>Rejected {result.rejected} with missing fields. </>}
                      {counts.bad > 0 && <>{counts.bad} row{counts.bad === 1 ? "" : "s"} still need a fix below.</>}
                    </p>
                    {result.imported > 0 && result.commsPausedDays > 0 && (
                      <p className="text-xs text-emerald-800 mt-1">
                        Automated emails are paused on this batch for {result.commsPausedDays} days.
                        You can allow them sooner from{" "}
                        <Link href={withSlug("/admin/onboarding/imports")} className="font-semibold underline underline-offset-2">
                          Imports History
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                </div>
                <Link href={withSlug("/admin/contacts")}>
                  <Button variant="outline" className="border-emerald-300 bg-white">
                    Open contacts
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
          <Dialog open={!!resolveRow} onOpenChange={(open) => { if (!open) setResolveKey(null); }}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              {resolveRow && (
                <form
                  onSubmit={(e) => { e.preventDefault(); saveAndNext(); }}
                  className="space-y-4"
                >
                  <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                      Fix row {rowNumber.get(resolveRow._key)}
                      {resolveRow._line ? <span className="text-sm font-normal text-slate-500">line {resolveRow._line} of {resolveRow._source}</span> : null}
                    </DialogTitle>
                    <DialogDescription>
                      {problemRows.length > 0
                        ? `Problem ${Math.max(1, resolvePosition + 1)} of ${problemRows.length}. Changes are saved to the list when you press Save.`
                        : "Changes are saved to the list when you press Save."}
                    </DialogDescription>
                  </DialogHeader>

                  {draftIssues.length > 0 ? (
                    <ul className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      {draftIssues.map((i) => (
                        <li key={i.message} className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {FIELD_LABEL[i.field]}: {i.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" /> This row is ready. Save to continue.
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {FIELDS.filter((f) => f.group === "Main" || showMoreFields).map((f, idx) => {
                      const bad = draftBad.has(f.key);
                      return (
                        <label key={f.key} className="space-y-1 text-sm">
                          <span className={cn("font-medium", bad ? "text-rose-700" : "text-slate-700")}>
                            {f.label}{(f.key === "name" || f.key === "email") && <span className="text-rose-600"> *</span>}
                          </span>
                          <Input
                            value={draft[f.key] || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            aria-invalid={bad || undefined}
                            autoFocus={bad ? draftIssues[0]?.field === f.key : idx === 0 && draftIssues.length === 0}
                            className={cn("h-9", bad && "border-rose-400 focus-visible:ring-rose-400")}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMoreFields((v) => !v)}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    {showMoreFields ? "Hide billing and history fields" : "Show billing and history fields"}
                  </button>

                  <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                    <Button type="button" variant="ghost" onClick={removeFromResolve} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                      <Trash2 className="mr-1.5 h-4 w-4" /> Remove row
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={goPrevious} disabled={resolvePosition <= 0}>
                        <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                      </Button>
                      <Button type="submit" className="bg-brand-primary hover:opacity-90">
                        {queue.length > 0 ? <>Save &amp; next <ChevronRight className="ml-1 h-4 w-4" /></> : "Save"}
                      </Button>
                    </div>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </PortalShell>
      </div>
    </>
  );
}
