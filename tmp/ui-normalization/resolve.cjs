const fs = require('fs');
const p = 'src/pages/admin/onboarding/clients.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); s = s.replace(a, b); };

rep(`import { PortalShell, PortalHeader, PageWorkbench } from "@/components/portal/ui";`,
`import { PortalShell, PortalHeader, PageWorkbench } from "@/components/portal/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";`);
rep(`  AlertTriangle, Trash2, Loader2, Users, Download, Sparkles, X, ArrowDown, Filter,`,
    `  AlertTriangle, Trash2, Loader2, Users, Download, Sparkles, X, ArrowDown, Filter, ChevronLeft, ChevronRight, Wrench,`);

// Resolve-mode state + logic, placed right after goToRow/nextProblem
rep(`  const nextProblem = () => {`, `  // ---- Resolve mode: fix problem rows one at a time ----------------------
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

  const nextProblem = () => {`);

// Entry points: problem card + chips + row Fix badge
rep(`                    <Button variant="outline" size="sm" onClick={nextProblem}>Next problem</Button>`,
`                    <Button size="sm" onClick={() => openResolve()} className="bg-rose-600 text-white hover:bg-rose-700">
                      <Wrench className="mr-1.5 h-3.5 w-3.5" /> Resolve {problemRows.length} row{problemRows.length === 1 ? "" : "s"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={nextProblem}>Jump to next</Button>`);
rep(`                        onClick={() => goToRow(r._key)}`, `                        onClick={() => openResolve(r._key)}`);
rep(`                                  <Badge className="bg-rose-100 text-rose-700 border-rose-200 border">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Fix
                                  </Badge>`,
`                                  <button
                                    type="button"
                                    onClick={() => openResolve(r._key)}
                                    className="inline-flex items-center rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                                    aria-label={\`Resolve row \${rowNumber.get(r._key)}\`}
                                  >
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Resolve
                                  </button>`);

// The dialog
rep(`        </PortalShell>`, `          <Dialog open={!!resolveRow} onOpenChange={(open) => { if (!open) setResolveKey(null); }}>
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
                        ? \`Problem \${Math.max(1, resolvePosition + 1)} of \${problemRows.length}. Changes are saved to the list when you press Save.\`
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
        </PortalShell>`);

fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
