const fs = require('fs');
const p = 'src/pages/admin/onboarding/clients.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); s = s.replace(a, b); };

// Limits + sheet model
rep(`interface PendingBatch {
  source: string;`, `/** Largest file read in the browser, and the bulk endpoint's per-upload cap. */
const MAX_FILE_MB = 10;
const MAX_IMPORT_ROWS = 5000;

interface SheetTable { name: string; headers: string[]; rows: string[][] }

interface PendingBatch {
  /** Changes every time a new table is staged; stale AI replies are ignored. */
  id: number;
  source: string;
  /** Excel only: every non-empty sheet, so the operator can switch. */
  sheets?: SheetTable[];
  sheetName?: string;`);

// Duplicate-email pass over the whole staged list
rep(`function rowIssues(r: RawRow): Issue[] {`, `/** Re-check every row, including emails repeated within the staged list. */
function withIssues<T extends RawRow & { issues: Issue[] }>(list: T[]): T[] {
  const firstByEmail = new Map<string, number>();
  return list.map((r, i) => {
    const issues = rowIssues(r);
    const email = (r.email || "").trim().toLowerCase();
    if (email && looksLikeEmail(email)) {
      const first = firstByEmail.get(email);
      if (first === undefined) firstByEmail.set(email, i);
      else issues.push({ field: "email", message: \`Same email as row \${first + 1}\` });
    }
    return { ...r, issues };
  });
}

function rowIssues(r: RawRow): Issue[] {`);

// BOM + delimiter detection
rep(`  const trimmed = text.trim();`, `  const trimmed = text.replace(/^\\uFEFF/, "").trim();`);
rep(`  const delim = firstLine.includes("\\t") ? "\\t" : ",";`,
`  // Tabs (pasted from a spreadsheet) win; semicolons when they outnumber
  // commas (Excel's CSV export in many locales); otherwise commas.
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = firstLine.includes("\\t") ? "\\t" : count(";") > count(",") ? ";" : ",";`);

// State + refs
rep(`  const [aiBusy, setAiBusy] = useState(false);`, `  const [aiBusy, setAiBusy] = useState(false);
  const batchSeq = useRef(0);
  const aiAbort = useRef<AbortController | null>(null);`);
rep(`  const fileInputRef = useRef<HTMLInputElement | null>(null);`, `  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => aiAbort.current?.abort(), []);`);
rep(`import { useMemo, useRef, useState } from "react";`, `import { useEffect, useMemo, useRef, useState } from "react";`);

// stageTable
rep(`  const stageTable = (source: string, headers: string[], body: string[][]) => {`,
`  const stageTable = (source: string, headers: string[], body: string[][], sheets?: SheetTable[], sheetName?: string) => {
    aiAbort.current?.abort();`);
rep(`    setPending({
      source,
      headers: cleanHeaders,`, `    batchSeq.current += 1;
    setPending({
      id: batchSeq.current,
      source,
      sheets,
      sheetName,
      headers: cleanHeaders,`);

// onFile: size + all sheets
rep(`    const ext = file.name.split(".").pop()?.toLowerCase();
    try {`, `    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        throw new Error(\`That file is over \${MAX_FILE_MB} MB. Split it into smaller files and import them one at a time.\`);
      }`);
rep(`        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error("Spreadsheet has no sheets");
        const sheet = wb.Sheets[sheetName];
        const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
        if (data.length === 0) throw new Error("Sheet is empty");
        const [headers, ...body] = data;
        stageTable(file.name, headers.map(String), body.map((r) => r.map(String)));`,
`        // Read every sheet that has data; start on the first one.
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
        stageTable(file.name, sheets[0].headers, sheets[0].rows, sheets.length > 1 ? sheets : undefined, sheets[0].name);`);
rep(`    const { headers, rows: body } = parseDelimited(pasted);
    stageTable("Pasted rows", headers, body);`, `    const { headers, rows: body } = parseDelimited(pasted);
    if (headers.length === 0) {
      toast({ title: "Nothing to read", description: "The pasted text has no rows." });
      return;
    }
    stageTable("Pasted rows", headers, body);`);

// Sheet switching
rep(`  const toggleFirstRowIsData = () => {`, `  const switchSheet = (name: string) => {
    const t = pending?.sheets?.find((x) => x.name === name);
    if (!pending || !t) return;
    stageTable(pending.source, t.headers, t.rows, pending.sheets, t.name);
  };

  const toggleFirstRowIsData = () => {`);

// AI call: abort, timeout, stale guard, clear errors
rep(`    if (!pending) return;
    setAiBusy(true);
    setAiNote(null);
    try {`, `    if (!pending || aiBusy) return;
    const batchId = pending.id;
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 40_000);
    setAiBusy(true);
    setAiNote(null);
    try {`);
rep(`        body: JSON.stringify({ headers, sampleRows: samples }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "AI matching is unavailable right now.");`,
`        body: JSON.stringify({ headers, sampleRows: samples }),
        signal: controller.signal,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          r.status === 401 ? "Your session has expired. Sign in again to use AI matching."
            : r.status === 403 ? "Only owners and admins can use AI matching."
              : j?.error || "AI matching is unavailable right now. Match the columns by hand.",
        );
      }`);
rep(`      setPending((p) => {
        if (!p) return p;
        const columns = p.columns.map((c, i) => {`, `      setPending((p) => {
        // A different file or sheet was loaded while AI was working.
        if (!p || p.id !== batchId) return p;
        const columns = p.columns.map((c, i) => {`);
rep(`          return { target: d.target as FieldKey, via: "ai" as const, confidence: d.confidence, reason: d.rationale };`,
`          if (!(d.target in FIELD_LABEL)) return c;
          return { target: d.target as FieldKey, via: "ai" as const, confidence: d.confidence, reason: d.rationale };`);
rep(`      const matched = decisions.filter((d) => d.target !== "skip").length;
      setAiNote(`, `      if (batchSeq.current !== batchId) return;
      const matched = decisions.filter((d) => d.target !== "skip").length;
      setAiNote(matched === 0
        ? "AI couldn't match any column with confidence. Choose them from the dropdowns."
        : `);
rep(`    } catch (e: any) {
      setAiNote(e?.message || "AI matching is unavailable right now. Match the columns by hand.");
    } finally {
      setAiBusy(false);
    }`, `    } catch (e: any) {
      if (batchSeq.current !== batchId) return;
      setAiNote(e?.name === "AbortError"
        ? "AI matching took too long. Try again, or match the columns by hand."
        : e instanceof TypeError
          ? "Couldn't reach the server. Check your connection and try again."
          : e?.message || "AI matching is unavailable right now. Match the columns by hand.");
    } finally {
      window.clearTimeout(timer);
      if (aiAbort.current === controller) aiAbort.current = null;
      setAiBusy(false);
    }`);

// Use the duplicate-aware check everywhere rows change
rep(`    setRows((prev) => [...prev, ...built]);`, `    setRows((prev) => withIssues([...prev, ...built]));`);
rep(`    setRows((prev) => prev.map((r) => {
      if (r._key !== key) return r;
      const next = { ...r, [field]: val };
      next.issues = rowIssues(next);
      return next;
    }));`, `    setRows((prev) => withIssues(prev.map((r) => (r._key === key ? { ...r, [field]: val } : r))));`);
rep(`  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r._key !== key));`,
`  const removeRow = (key: string) => setRows((prev) => withIssues(prev.filter((r) => r._key !== key)));`);

// Import: row cap, safe JSON, clear messages
rep(`    setSubmitting(true);
    setResult(null);
    setImportError(null);`, `    if (valid.length > MAX_IMPORT_ROWS) {
      toast({
        title: "Too many rows for one import",
        description: \`Up to \${MAX_IMPORT_ROWS.toLocaleString()} clients can import at once. Remove some rows or split the file.\`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    setResult(null);
    setImportError(null);`);
rep(`      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Upload failed");`, `      const j = await r.json().catch(() => ({} as any));
      if (!r.ok) {
        throw new Error(
          r.status === 401 ? "Your session has expired. Sign in again; your rows are still here."
            : j?.error || \`The server could not import the rows (error \${r.status}). Your rows are still staged below.\`,
        );
      }`);
rep(`      setImportError(e?.message || "The import did not go through. Your rows are still staged below.");
      toast({ title: "Import failed", description: e?.message || "", variant: "destructive" });`,
`      const msg = e instanceof TypeError
        ? "Couldn't reach the server. Check your connection; your rows are still staged below."
        : e?.message || "The import did not go through. Your rows are still staged below.";
      setImportError(msg);
      toast({ title: "Import failed", description: msg, variant: "destructive" });`);

// UI: sheet picker, title, note tone, cancel aborts
rep(`                <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">`,
`                {pending.sheets && pending.sheets.length > 1 && (
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
                <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">`);
rep(`<h2 className="font-semibold text-slate-900">Match columns · {pending.source}</h2>`,
`<h2 className="font-semibold text-slate-900">Match columns · {pending.source}{pending.sheets && pending.sheetName ? \` · \${pending.sheetName}\` : ""}</h2>`);
rep(`                  <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-xs text-slate-700">`,
`                  <p role="status" className={cn("mb-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs",
                    aiNote.startsWith("AI matched") ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>`);
rep(`<Button variant="ghost" size="sm" onClick={() => { setPending(null); setAiNote(null); }}>`,
`<Button variant="ghost" size="sm" onClick={() => { aiAbort.current?.abort(); setPending(null); setAiNote(null); }}>`);

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
