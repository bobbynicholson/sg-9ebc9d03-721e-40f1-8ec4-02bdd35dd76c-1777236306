const fs = require('fs');
const p = 'src/pages/admin/onboarding/clients.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); s = s.replace(a, b); };
const cut = (start, end) => {
  const i = s.indexOf(start); const j = s.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('cut: ' + start.slice(0, 60));
  return [i, j + end.length];
};

// Pure helpers above the component
rep(`function ProtectedClientImport() {`, `type AiDecision = { index: number; target: string; confidence: number; rationale: string };

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

function ProtectedClientImport() {`);

// Refs: latest pending + last auto-accepted batch for "change matches"
rep(`  const batchSeq = useRef(0);`, `  const batchSeq = useRef(0);
  const pendingRef = useRef<PendingBatch | null>(null);
  const lastBatch = useRef<{ batch: PendingBatch; keys: string[] } | null>(null);
  const [autoAccepted, setAutoAccepted] = useState<null | { source: string; count: number; via: "ai" | "name" }>(null);`);
rep(`  const [pending, setPending] = useState<PendingBatch | null>(null);`, `  const [pending, setPendingState] = useState<PendingBatch | null>(null);
  const setPending = (next: PendingBatch | null | ((p: PendingBatch | null) => PendingBatch | null)) => {
    setPendingState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      pendingRef.current = value;
      return value;
    });
  };`);

// stageTable: build the batch, then match automatically
rep(`  const stageTable = (source: string, headers: string[], body: string[][], sheets?: SheetTable[], sheetName?: string) => {`,
`  const stageTable = (source: string, headers: string[], body: string[][], sheets?: SheetTable[], sheetName?: string, autoAdvance = true) => {`);
rep(`    batchSeq.current += 1;
    setPending({
      id: batchSeq.current,
      source,
      sheets,
      sheetName,
      headers: cleanHeaders,
      rows: body.map((r) => r.map((c) => String(c ?? ""))),
      firstRowIsData: noHeaderMatch,
      columns: noHeaderMatch ? columnsByPosition(cleanHeaders.length) : byName,
    });
    setAiNote(null);
    setResult(null);
  };`, `    batchSeq.current += 1;
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
      title: \`\${built.length} row\${built.length === 1 ? "" : "s"} ready to review\`,
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
  };`);

// switchSheet: picking a sheet by hand re-matches but waits for review
rep(`    stageTable(pending.source, t.headers, t.rows, pending.sheets, t.name);`,
    `    stageTable(pending.source, t.headers, t.rows, pending.sheets, t.name, false);`);

// matchWithAi: accept a batch, auto-advance when confident
const [ms, me] = cut(`  const matchWithAi = async () => {`, `      setAiBusy(false);
    }
  };`);
s = s.slice(0, ms) + `  const matchWithAi = async (batchArg?: PendingBatch, autoAdvance = false) => {
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
      const headers = batch.firstRowIsData ? batch.headers.map((_, i) => \`Column \${i + 1}\`) : batch.headers;
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
          ? \`AI matched \${matched} column\${matched === 1 ? "" : "s"}, but no email column was found. Pick it below, then continue.\`
          : low > 0
            ? \`AI matched \${matched} column\${matched === 1 ? "" : "s"}; \${low} \${low === 1 ? "is" : "are"} uncertain (amber). Check them, then continue.\`
            : \`AI matched \${matched} column\${matched === 1 ? "" : "s"}. Check the suggestions, then continue.\`);
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
  };` + s.slice(me);

// addPendingRows -> commitBatch (manual review path)
const [as_, ae] = cut(`  const addPendingRows = () => {`, `    });
  };`);
s = s.slice(0, as_) + `  const addPendingRows = () => {
    if (!pending) return;
    if (!pending.columns.some((c) => c.target !== "skip")) {
      toast({ title: "Match at least one column", description: "Choose which field each column holds." });
      return;
    }
    commitBatch(pending, "manual");
  };` + s.slice(ae);

// Match button: manual trigger must not pass the click event as a batch
rep(`<Button variant="outline" size="sm" onClick={matchWithAi} disabled={aiBusy}>`,
    `<Button variant="outline" size="sm" onClick={() => void matchWithAi()} disabled={aiBusy}>`);

// Busy banner inside the match card
rep(`                {aiNote && (`, `                {aiBusy && (
                  <p role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-xs text-slate-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
                    Matching your columns automatically. Clear matches go straight to the review list.
                  </p>
                )}
                {aiNote && (`);

// Auto-accepted notice above the review list
rep(`          {/* Step 3: rows to fix */}`, `          {autoAccepted && !pending && rows.length > 0 && (
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

          {/* Step 3: rows to fix */}`);

// Copy: tell people it's automatic
rep(`                    CSV, TSV or Excel in any column layout. You will match the columns in the next step.`,
    `                    CSV, TSV or Excel in any column layout. Columns are matched automatically; you only check unclear ones.`);
rep(`clearAll = () => { setRows([]); setResult(null); setSourceName(null); setOnlyProblems(false); };`,
    `clearAll = () => { setRows([]); setResult(null); setSourceName(null); setOnlyProblems(false); setAutoAccepted(null); lastBatch.current = null; };`);

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
