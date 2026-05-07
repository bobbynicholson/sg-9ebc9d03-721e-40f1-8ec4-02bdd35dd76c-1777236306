/**
 * ImportRecordsModal -- routine bulk-upload UI for clients + leads.
 *
 * Single component used from the Contacts page (template="clients")
 * and the Leads page (template="leads"). Same engine the onboarding
 * wizard uses underneath: /api/imports/upload -> auto-mapping
 * shortcut -> /api/imports/[id]/preview -> /api/imports/[id]/commit.
 *
 * Differences from the wizard:
 *   - Pre-scoped to one target table (no "is this clients or
 *     orders?" decision step).
 *   - Skips the AI mapping step entirely thanks to the
 *     auto-mapping shortcut + ?template= override.
 *   - Lives inside a Dialog so the operator never leaves the
 *     Contacts / Leads page.
 *
 * The cap shown to the operator comes from the API response
 * (sourced from app_config.import_row_cap), so super_admin tuning
 * the cap in /admin/platform/settings reflects here without a
 * redeploy.
 */
import { Fragment, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  Download,
  Upload,
  AlertCircle,
  Check,
  Loader2,
  RefreshCw,
  Pencil,
  X,
  Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TemplateType } from "@/lib/importTemplates";

// Editable fields per target table -- the small set of common fields
// the operator can fix from the preview screen without re-uploading.
// Mirrors the columns in importTemplates so the operator sees the
// same shape they uploaded.
const EDIT_FIELDS: Record<TemplateType, Array<{ key: string; label: string; type?: "email" | "tel" | "text" }>> = {
  clients: [
    { key: "client_name",      label: "Client name" },
    { key: "email",            label: "Email", type: "email" },
    { key: "mobile_number",    label: "Mobile", type: "tel" },
    { key: "landline_number",  label: "Landline", type: "tel" },
    { key: "billing_city",     label: "City" },
  ],
  leads: [
    { key: "contact_name",     label: "Contact name" },
    { key: "email",            label: "Email", type: "email" },
    { key: "mobile_number",    label: "Mobile", type: "tel" },
    { key: "company_name",     label: "Company" },
    { key: "event_date",       label: "Event date" },
  ],
};

type Step = "pick" | "previewing" | "preview" | "committing" | "done";

interface PreviewRow {
  id: string;
  source_row_index: number | null;
  mapped_data: Record<string, any> | null;
  status: "pending" | "skipped" | "error";
  error_message: string | null;
  preview_warnings: string[] | null;
  dedup_match_id: string | null;
  dedup_match_table: string | null;
  dedup_decision: "skip" | "update" | "create_new" | null;
}

type RowCounts = { inserted: number; updated: number; skipped: number; errored: number };

interface CommitSummary {
  clients?: RowCounts;
  leads?: RowCounts;
  orders?: RowCounts;
  dry_run?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateType;
  /** Display name -- "client" / "lead" -- used in copy. */
  recordLabel: string;
  /** Plural display name -- "clients" / "leads" -- used in copy. */
  recordLabelPlural: string;
  /** Called after a successful commit so the parent page can refresh its list. */
  onComplete?: () => void;
}

export function ImportRecordsModal({
  open,
  onOpenChange,
  template,
  recordLabel,
  recordLabelPlural,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rowCap, setRowCap] = useState<number | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{
    total: number;
    ok: number;
    warnings: number;
    errors: number;
    duplicates?: number;
  } | null>(null);
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null);
  const [dryRunSummary, setDryRunSummary] = useState<CommitSummary | null>(null);
  // Progress for the batched commit loop. populated from each
  // batch's `processed` + `remaining` so the user sees a live count
  // while a 4 000-row import works through 16 batches.
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null);
  // Feature E: quick-validation tally returned from /upload before
  // preview runs. Surfaces "X OK, Y warnings, Z errors" so operators
  // get a shape-of-the-data answer in seconds on big files.
  const [earlyValidation, setEarlyValidation] = useState<{
    ok: number;
    warnings: number;
    errors: number;
    topIssues: Array<{ reason: string; count: number }>;
  } | null>(null);
  // Inline-edit state: which row is currently expanded for editing,
  // and the form values in flight. Keyed by row id so switching
  // between rows starts fresh each time.
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setStep("pick");
    setError(null);
    setBusy(false);
    setJobId(null);
    setPreviewRows([]);
    setPreviewSummary(null);
    setCommitSummary(null);
    setDryRunSummary(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    // Direct GET -- the endpoint streams an xlsx attachment.
    window.location.href = `/api/imports/templates/${template}`;
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/imports/upload?template=${template}`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Upload failed (${r.status})`);
      setJobId(j.jobId);
      if (typeof j.rowCap === "number") setRowCap(j.rowCap);
      // Feature E: surface the upload's quick-validation tally before
      // preview kicks in. Operators on huge files see "of 4775 rows:
      // 4730 OK, 32 warning, 13 error" within seconds rather than
      // waiting for the full preview pass to finish.
      const ev = j?.summary?.earlyValidation;
      if (ev) setEarlyValidation(ev);
      // Auto-mapping should have fired (?template= override). Now run
      // preview so the operator sees per-row outcome.
      setStep("previewing");
      const p = await fetch(`/api/imports/${j.jobId}/preview`, { method: "POST" });
      const pj = await p.json();
      if (!p.ok) throw new Error(pj?.error || "Preview failed");
      // Pull the row list from the job-detail endpoint (which
      // honours ?rows=1).
      const rowsRes = await fetch(`/api/imports/${j.jobId}?rows=1`);
      let rowsJson: any = {};
      if (rowsRes.ok) rowsJson = await rowsRes.json().catch(() => ({}));
      setPreviewRows((rowsJson.rows || []) as PreviewRow[]);
      setPreviewSummary(pj.summary || null);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      setStep("pick");
    } finally {
      setBusy(false);
      // Reset the file input so re-picking the same file fires onChange.
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // ── Inline edit: open / save / cancel ──────────────────────────
  const openEditor = (row: PreviewRow) => {
    if (!jobId) return;
    setEditingRowId(row.id);
    const m = row.mapped_data || {};
    const initial: Record<string, string> = {};
    for (const f of EDIT_FIELDS[template]) {
      initial[f.key] = String(m[f.key] ?? "");
    }
    setEditForm(initial);
    setError(null);
  };

  const cancelEditor = () => {
    setEditingRowId(null);
    setEditForm({});
  };

  const saveEditor = async () => {
    if (!jobId || !editingRowId) return;
    setEditSaving(true);
    setError(null);
    try {
      // Send only fields the operator actually touched (non-empty
      // strings + cleared fields signalled with empty string).
      const overrides: Record<string, string> = {};
      for (const [k, v] of Object.entries(editForm)) {
        overrides[k] = v.trim();
      }
      const r = await fetch(`/api/imports/${jobId}/rows/${editingRowId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Edit failed");

      // Apply the server's updated row state to the in-memory preview
      // list so the row's badge + summary refresh without a re-fetch.
      setPreviewRows((prev) =>
        prev.map((row) =>
          row.id === editingRowId
            ? {
                ...row,
                mapped_data: j.mapped_data,
                status: j.status,
                error_message: j.error_message,
                preview_warnings: j.warnings,
              }
            : row,
        ),
      );

      // Roll the summary's ok/error counts forward so the green
      // "Will import" tile reflects the fix immediately.
      if (previewSummary) {
        const wasError = previewRows.find((p) => p.id === editingRowId)?.status === "error";
        const nowError = j.status === "error";
        if (wasError && !nowError) {
          setPreviewSummary({
            ...previewSummary,
            errors: Math.max(0, previewSummary.errors - 1),
            ok: previewSummary.ok + 1,
          });
        } else if (!wasError && nowError) {
          setPreviewSummary({
            ...previewSummary,
            errors: previewSummary.errors + 1,
            ok: Math.max(0, previewSummary.ok - 1),
          });
        }
      }

      setEditingRowId(null);
      setEditForm({});
    } catch (e: any) {
      setError(e?.message || "Edit failed");
    } finally {
      setEditSaving(false);
    }
  };

  const setRowDecision = async (
    rowId: string,
    decision: "skip" | "update" | "create_new",
  ) => {
    if (!jobId) return;
    // Optimistic update so the picker feels snappy.
    setPreviewRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, dedup_decision: decision } : r)),
    );
    try {
      const r = await fetch(`/api/imports/${jobId}/rows/${rowId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Failed to set decision");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to set decision");
    }
  };

  // Robust response parser. The commit endpoint can return non-JSON in
  // pathological failure modes (Vercel function timeout returns an HTML
  // error page; an upstream proxy can send plain text). Reading via
  // r.json() throws a generic "Unexpected token ..." which is what
  // Callum saw on his 4 000-row import. This wrapper falls through to
  // r.text() so the operator sees something useful.
  const readResponse = async (r: Response): Promise<{ json: any; rawText?: string }> => {
    const text = await r.text();
    try {
      return { json: text ? JSON.parse(text) : {} };
    } catch {
      return { json: null, rawText: text };
    }
  };

  // Aggregate two CommitSummary instances. Used to roll up batch
  // summaries returned from each /commit call into a single tally
  // we show on the "Import complete" screen.
  const mergeSummaries = (a: CommitSummary | null, b: CommitSummary): CommitSummary => {
    const ZERO: RowCounts = { inserted: 0, updated: 0, skipped: 0, errored: 0 };
    const sum = (x: RowCounts | undefined, y: RowCounts | undefined): RowCounts => {
      const xx = x ?? ZERO;
      const yy = y ?? ZERO;
      return {
        inserted: xx.inserted + yy.inserted,
        updated:  xx.updated  + yy.updated,
        skipped:  xx.skipped  + yy.skipped,
        errored:  xx.errored  + yy.errored,
      };
    };
    return {
      clients: sum(a?.clients, b.clients),
      orders:  sum(a?.orders,  b.orders),
      leads:   sum(a?.leads,   b.leads),
      dry_run: b.dry_run,
    };
  };

  const runCommit = async (dryRun: boolean) => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    if (!dryRun) {
      setStep("committing");
      setCommitProgress({ done: 0, total: willImportCount || 0 });
    }
    try {
      // Loop until the server reports `more: false`. Each call
      // commits a batch of <= 250 rows and reports progress so the
      // user sees the count tick up. A previous version of this
      // handler ran the entire commit synchronously; on a 4 000-row
      // import that pushed past Vercel's 300s function cap and the
      // gateway returned an HTML error page, which JSON.parse choked
      // on with "Unexpected token 'A', 'An error o'... is not valid
      // JSON" -- the row of pics Callum sent.
      let aggregate: CommitSummary | null = null;
      let processedSoFar = 0;
      // Hard stop on the loop in case the server forgets to set
      // `more: false`. 200 batches = 50 000 rows max.
      const MAX_LOOPS = 200;
      for (let i = 0; i < MAX_LOOPS; i += 1) {
        const r = await fetch(`/api/imports/${jobId}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dry_run: dryRun }),
        });
        const { json: j, rawText } = await readResponse(r);
        if (!r.ok) {
          const msg = j?.error
            || (rawText && rawText.length < 300 ? rawText : `Commit failed (${r.status})`);
          throw new Error(msg);
        }
        if (!j) {
          throw new Error("Server returned a non-JSON response (probably a function timeout). Try again -- the import auto-resumes from where it stopped.");
        }
        const summary = (j.summary || null) as CommitSummary;
        aggregate = aggregate ? mergeSummaries(aggregate, summary) : summary;
        processedSoFar += Number(j.processed ?? 0);
        if (!dryRun) {
          const total = processedSoFar + Number(j.remaining ?? 0);
          setCommitProgress({ done: processedSoFar, total });
        }
        if (dryRun || !j.more) break;
      }

      if (dryRun) {
        setDryRunSummary(aggregate);
      } else {
        setCommitSummary(aggregate);
        setStep("done");
        setCommitProgress(null);
        if (onComplete) onComplete();
      }
    } catch (e: any) {
      setError(e?.message || "Commit failed");
      if (!dryRun) {
        // The server keeps row state in import_rows, so even a hard
        // failure here is recoverable -- the operator clicks "Import
        // clients" again and the next batch picks up the remaining
        // pending rows.
        setStep("preview");
        setCommitProgress(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const commit = () => runCommit(false);
  const testRun = () => runCommit(true);

  const okCount = previewSummary
    ? previewSummary.ok + previewSummary.warnings
    : 0;
  const errorCount = previewSummary?.errors ?? 0;
  const duplicateCount = previewSummary?.duplicates ?? 0;
  const skipDecisionCount = previewRows.filter(
    (r) => r.dedup_match_id && (r.dedup_decision || "skip") === "skip",
  ).length;
  const willImportCount = okCount - skipDecisionCount;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Import {recordLabelPlural}
          </DialogTitle>
          <DialogDescription>
            Bulk upload {recordLabelPlural} from an Excel or CSV file.
            {rowCap != null && (
              <> Up to <strong>{rowCap.toLocaleString("en-ZA")} rows</strong> per file.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-rose-200 bg-rose-50">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <AlertDescription className="text-rose-800 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {step === "pick" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-3">
              <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-700">
                Download the template, fill in your {recordLabelPlural}, then upload.
              </p>
              <p className="text-xs text-slate-500">
                Required fields are marked with *. Hover over column headers in Excel for hints.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download {recordLabel} template
                </Button>
                <Button
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload filled file
                </Button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              We'll preview every row before anything saves.
              Existing {recordLabelPlural} (matched by email) are skipped automatically so re-running an import is safe.
            </p>
          </div>
        )}

        {step === "previewing" && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
            <p className="text-sm text-slate-600 mt-2">Parsing + validating rows...</p>
            {earlyValidation && (
              <div className="mt-4 max-w-md mx-auto text-left">
                <p className="text-xs text-slate-600 text-center mb-2">
                  Quick scan: <strong className="text-emerald-700">{earlyValidation.ok.toLocaleString("en-ZA")} OK</strong>
                  {earlyValidation.warnings > 0 && (
                    <> · <strong className="text-amber-700">{earlyValidation.warnings.toLocaleString("en-ZA")} warning</strong></>
                  )}
                  {earlyValidation.errors > 0 && (
                    <> · <strong className="text-rose-700">{earlyValidation.errors.toLocaleString("en-ZA")} error</strong></>
                  )}
                </p>
                {earlyValidation.topIssues.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                    <p className="font-medium mb-1">Top issues:</p>
                    <ul className="space-y-0.5">
                      {earlyValidation.topIssues.map((i) => (
                        <li key={i.reason} className="flex justify-between">
                          <span>{i.reason}</span>
                          <span className="font-mono text-slate-500">{i.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-slate-500 mt-2 text-center">
                  Running the full preview now -- you'll be able to fix any flagged rows inline.
                </p>
              </div>
            )}
          </div>
        )}

        {step === "preview" && previewSummary && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-4 gap-2">
              <SummaryStat label="Will import" value={willImportCount} tone="success" />
              <SummaryStat label="Duplicates" value={duplicateCount} tone={duplicateCount > 0 ? "warn" : "muted"} />
              <SummaryStat label="Errors" value={errorCount} tone={errorCount > 0 ? "danger" : "muted"} />
              <SummaryStat label="Total rows" value={previewSummary.total} tone="muted" />
            </div>

            {duplicateCount > 0 && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-xs leading-relaxed">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      {duplicateCount} {duplicateCount === 1 ? "row matches an existing record" : "rows match existing records"}.
                      Default is "skip". If you're re-uploading a cleaned-up sheet,
                      flip them to "update" -- the importer only overwrites fields the
                      new sheet has values for, so manual edits stay safe.
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1 border-amber-300 hover:bg-amber-100"
                      onClick={() => {
                        // Flip every duplicate to "update". Optimistic
                        // local update; persists per-row via the
                        // existing decision endpoint.
                        const targets = previewRows.filter((r) => r.dedup_match_id && (r.dedup_decision || "skip") === "skip");
                        targets.forEach((r) => setRowDecision(r.id, "update"));
                      }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Update all matches
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {dryRunSummary && (
              <Alert className="border-sky-200 bg-sky-50">
                <Check className="h-4 w-4 text-sky-600" />
                <AlertDescription className="text-sky-800 text-xs">
                  Test run: would insert <strong>{(dryRunSummary[template]?.inserted ?? 0).toLocaleString("en-ZA")}</strong>,
                  update <strong>{(dryRunSummary[template]?.updated ?? 0).toLocaleString("en-ZA")}</strong>,
                  skip <strong>{(dryRunSummary[template]?.skipped ?? 0).toLocaleString("en-ZA")}</strong>.
                  Nothing was saved.
                </AlertDescription>
              </Alert>
            )}

            <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                    const m = r.mapped_data || {};
                    const summary =
                      m.client_name ||
                      m.contact_name ||
                      m.email ||
                      m.client_email ||
                      "(empty)";
                    const isMatch = !!r.dedup_match_id;
                    const decision = (r.dedup_decision || "skip") as
                      | "skip" | "update" | "create_new";
                    const flagged =
                      r.status === "error" ||
                      r.status === "skipped" ||
                      (r.preview_warnings && r.preview_warnings.length > 0);
                    const isEditing = editingRowId === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-t border-slate-100">
                          <td className="px-3 py-1.5 font-mono text-slate-500 align-top">
                            {r.source_row_index ?? "?"}
                          </td>
                          <td className="px-3 py-1.5 align-top">
                            <RowStatusBadge
                              status={r.status}
                              warnings={r.preview_warnings || []}
                              isDuplicate={isMatch}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-slate-700">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="truncate">{summary}</div>
                                {r.error_message && (
                                  <div className="text-rose-600 text-[11px] mt-0.5">
                                    {r.error_message}
                                  </div>
                                )}
                                {r.preview_warnings && r.preview_warnings.length > 0 && (
                                  <div className="text-amber-700 text-[11px] mt-0.5">
                                    {r.preview_warnings.slice(0, 2).join("; ")}
                                  </div>
                                )}
                                {isMatch && (
                                  <div className="mt-1 flex items-center gap-1 text-[11px]">
                                    <span className="text-amber-700">On file:</span>
                                    <select
                                      value={decision}
                                      onChange={(e) =>
                                        setRowDecision(
                                          r.id,
                                          e.target.value as "skip" | "update" | "create_new",
                                        )
                                      }
                                      className="border border-slate-300 rounded px-1 py-0.5 bg-white text-[11px]"
                                    >
                                      <option value="skip">Skip</option>
                                      <option value="update">Update existing</option>
                                      <option value="create_new">Create new</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                              {flagged && !isEditing && (
                                <button
                                  type="button"
                                  onClick={() => openEditor(r)}
                                  className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700"
                                  title="Fix this row inline -- no re-upload needed"
                                >
                                  <Pencil className="w-3 h-3" />
                                  Fix
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr className="bg-slate-50 border-t border-slate-100">
                            <td colSpan={3} className="px-4 py-3">
                              <div className="text-[11px] text-slate-600 mb-2 flex items-center gap-1">
                                <Pencil className="w-3 h-3" />
                                Editing row {r.source_row_index ?? "?"}. Save runs the same checks as the original preview -- if your fix resolves the error the row goes green automatically.
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {EDIT_FIELDS[template].map((f) => (
                                  <div key={f.key}>
                                    <Label className="text-[11px] text-slate-600">{f.label}</Label>
                                    <Input
                                      type={f.type ?? "text"}
                                      value={editForm[f.key] ?? ""}
                                      onChange={(e) =>
                                        setEditForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                                      }
                                      className="h-8 text-xs mt-0.5"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-3">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1 h-7 text-xs"
                                  onClick={cancelEditor}
                                  disabled={editSaving}
                                >
                                  <X className="w-3 h-3" />
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="gap-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                  onClick={saveEditor}
                                  disabled={editSaving}
                                >
                                  {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  Save
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {okCount === 0 && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  No rows are ready to import. Fix the errors in your file and re-upload.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === "committing" && (
          <div className="py-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
            <p className="text-sm text-slate-600 mt-2">Saving {recordLabelPlural}...</p>
            {commitProgress && commitProgress.total > 0 && (
              <>
                <p className="text-xs text-slate-500 mt-3">
                  {commitProgress.done.toLocaleString()} of {commitProgress.total.toLocaleString()} rows processed
                </p>
                <div className="mt-2 mx-auto w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((commitProgress.done / Math.max(1, commitProgress.total)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Large imports run in batches. Don&apos;t close this window.
                </p>
              </>
            )}
          </div>
        )}

        {step === "done" && commitSummary && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Import complete
                </p>
                <p className="text-xs text-emerald-800 mt-1">
                  {commitSummary[template]?.inserted ?? 0} new {recordLabelPlural} added.
                  {(commitSummary[template]?.updated ?? 0) > 0 && (
                    <> {commitSummary[template]?.updated} updated.</>
                  )}
                  {(commitSummary[template]?.skipped ?? 0) > 0 && (
                    <> {commitSummary[template]?.skipped} skipped (already on file).</>
                  )}
                  {(commitSummary[template]?.errored ?? 0) > 0 && (
                    <> {commitSummary[template]?.errored} errored.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Pick a different file
              </Button>
              <Button
                variant="outline"
                onClick={testRun}
                disabled={busy || okCount === 0}
                title="Run all the checks without saving anything"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Test run
              </Button>
              <Button
                onClick={commit}
                disabled={busy || willImportCount + previewRows.filter(r => r.dedup_match_id && r.dedup_decision === "update").length === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Import {recordLabelPlural}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={close}>Done</Button>
          )}
          {(step === "pick" || step === "previewing" || step === "committing") && (
            <Button variant="outline" onClick={close} disabled={busy}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "muted" | "warn";
}) {
  const map = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    muted: "bg-slate-50 text-slate-700 border-slate-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${map[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold opacity-70">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value.toLocaleString("en-ZA")}</div>
    </div>
  );
}

function RowStatusBadge({
  status,
  warnings,
  isDuplicate,
}: {
  status: string;
  warnings: string[];
  isDuplicate?: boolean;
}) {
  if (status === "error") {
    return <Badge variant="destructive" className="text-[10px]">Error</Badge>;
  }
  if (status === "skipped") {
    return <Badge variant="secondary" className="text-[10px]">Skip</Badge>;
  }
  if (isDuplicate) {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200">
        Dupe
      </Badge>
    );
  }
  if (warnings.length > 0) {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200">
        Warn
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
      OK
    </Badge>
  );
}
