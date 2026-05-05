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
import { useRef, useState } from "react";
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
} from "lucide-react";
import type { TemplateType } from "@/lib/importTemplates";

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

  const runCommit = async (dryRun: boolean) => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    if (!dryRun) setStep("committing");
    try {
      const r = await fetch(`/api/imports/${jobId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Commit failed (${r.status})`);
      const summary = (j.summary || null) as CommitSummary;
      if (dryRun) {
        setDryRunSummary(summary);
      } else {
        setCommitSummary(summary);
        setStep("done");
        if (onComplete) onComplete();
      }
    } catch (e: any) {
      setError(e?.message || "Commit failed");
      if (!dryRun) setStep("preview");
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
                  {duplicateCount} {duplicateCount === 1 ? "row matches an existing record" : "rows match existing records"}.
                  Default is "skip". Switch any row to "update" to overwrite the existing record's fields, or "create new" to keep both.
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
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono text-slate-500">
                          {r.source_row_index ?? "?"}
                        </td>
                        <td className="px-3 py-1.5">
                          <RowStatusBadge
                            status={r.status}
                            warnings={r.preview_warnings || []}
                            isDuplicate={isMatch}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-slate-700">
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
                        </td>
                      </tr>
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
