/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding/import (slug-aware: /[slug]/admin/onboarding/import)
 *
 * The catering team's upload-and-go onboarding tool. Five-step
 * wizard:
 *   1. Upload  -- drop a .xlsx / .csv with clients + orders
 *   2. Mapping -- AI returns a header -> field mapping with
 *                 confidence; the team eyeballs and confirms
 *   3. Preview -- per-row outcome preview (insert / skip / error)
 *   4. Commit  -- apply, persist, stamp import_job_id for rollback
 *   5. Done    -- summary + rollback CTA
 *
 * Every step hits a real API endpoint (this is NOT a localStorage
 * mock).
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Upload, Sparkles, Eye, CheckCircle2, RotateCcw, Loader2,
  AlertTriangle, FileSpreadsheet, Wand2,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/ChatBot";
import { useAuth } from "@/contexts/AuthContext";

type Step = "upload" | "mapping" | "preview" | "commit" | "done";

interface JobShape {
  id: string;
  status: string;
  source_filename: string | null;
  source_row_count: number | null;
  mapping: any | null;
  summary: any | null;
}

interface RowShape {
  id: string;
  sheet: string;
  source_row_index: number | null;
  source_data: any;
  mapped_data: any | null;
  target_table: string | null;
  status: string;
  error_message: string | null;
  preview_warnings: string[] | null;
}

export default function ProtectedImportPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ImportPage />
    </ProtectedRoute>
  );
}

function ImportPage() {
  const { user } = useAuth() as any;
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;
  const { toast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobShape | null>(null);
  const [rows, setRows] = useState<RowShape[]>([]);
  const [busy, setBusy] = useState<boolean>(false);

  // Local edits to the AI mapping before the team confirms it.
  const [editedMapping, setEditedMapping] = useState<any>(null);

  // Drilldown filter for the preview step row table.
  const [rowFilter, setRowFilter] = useState<"all" | "warnings" | "errors" | "skipped">("all");

  const fileInput = useRef<HTMLInputElement | null>(null);

  // Resume support: /admin/onboarding/import?jobId=<id> hydrates from
  // the existing row + jumps to the right step.
  useEffect(() => {
    const qid = (router.query.jobId as string | undefined) || null;
    if (qid && qid !== jobId) {
      setJobId(qid);
      refreshJob(qid).then(() => {
        // Step inference is in the refresh effect below.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.jobId]);

  // Step inference whenever the job updates.
  useEffect(() => {
    if (!job) return;
    if (job.status === "uploaded" || job.status === "mapped") setStep("mapping");
    else if (job.status === "previewed") setStep("preview");
    else if (job.status === "completed") setStep("done");
    // 'committing' / 'failed' / 'rolled_back' stay where they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const refreshJob = async (id: string, withRows = false) => {
    const res = await fetch(`/api/imports/${id}${withRows ? "?rows=1" : ""}`);
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Could not load import", description: json?.error || "", variant: "destructive" });
      return;
    }
    setJob(json.job);
    if (json.rows) setRows(json.rows as RowShape[]);
    if (json.job?.mapping && !editedMapping) setEditedMapping(json.job.mapping);
  };

  // ── Step 1: Upload ────────────────────────────────────────────────
  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/imports/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Upload failed");
      setJobId(json.jobId);
      await refreshJob(json.jobId);
      setStep("mapping");
      // Kick the AI mapping immediately -- the team usually waits
      // ~2-3 s and pressing the button manually feels redundant.
      runMapping(json.jobId);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2: Mapping ────────────────────────────────────────────────
  const runMapping = async (id?: string) => {
    const target = id || jobId;
    if (!target) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/${target}/map`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Mapping failed");
      await refreshJob(target);
    } catch (e: any) {
      toast({ title: "AI mapping failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── Step 3: Preview ────────────────────────────────────────────────
  const runPreview = async () => {
    if (!jobId) return;
    setBusy(true);
    try {
      // Persist the (possibly edited) mapping back onto the job
      // before previewing so the API uses what the team confirmed.
      if (editedMapping) {
        await fetch(`/api/imports/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mapping: editedMapping }),
        }).catch(() => undefined);
      }
      const res = await fetch(`/api/imports/${jobId}/preview`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Preview failed");
      // Pull rows alongside the job so the drilldown table can
      // render without an extra round trip.
      await refreshJob(jobId, true);
      setStep("preview");
    } catch (e: any) {
      toast({ title: "Preview failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── Step 4: Commit ────────────────────────────────────────────────
  const runCommit = async () => {
    if (!jobId) return;
    if (!confirm("Commit this import? Inserts will be stamped so you can undo within 24 h.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/${jobId}/commit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Commit failed");
      await refreshJob(jobId);
      setStep("done");
      toast({ title: "Import complete" });
    } catch (e: any) {
      toast({ title: "Commit failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runRollback = async () => {
    if (!jobId) return;
    if (!confirm("Roll back this import? This deletes the rows the import inserted -- existing records you had before are untouched.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/${jobId}/rollback`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Rollback failed");
      await refreshJob(jobId);
      toast({
        title: "Rolled back",
        description: `Removed ${json.clientsDeleted} clients + ${json.ordersDeleted} orders.`,
      });
    } catch (e: any) {
      toast({ title: "Rollback failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────
  const sheetNames = useMemo(() => {
    if (!editedMapping) return [];
    return Object.keys(editedMapping);
  }, [editedMapping]);

  const stepIndex = (s: Step) =>
    ({ upload: 0, mapping: 1, preview: 2, commit: 3, done: 4 } as Record<Step, number>)[s];

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>AI Import | CateringMS Admin</title>
      </Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-xl mx-auto">

          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
              <Wand2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                AI Import
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Drop a spreadsheet of your existing clients + outstanding orders. We'll match the columns, normalise the data, show you a preview, then load it.
              </p>
            </div>
          </div>

          {/* Stepper */}
          <div className="mb-6 flex items-center gap-2 text-xs">
            {(["upload", "mapping", "preview", "commit", "done"] as Step[]).map((s, i) => {
              const active = stepIndex(step) === i;
              const done = stepIndex(step) > i;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`px-3 py-1.5 rounded-full border ${
                      active
                        ? "bg-purple-100 text-purple-700 border-purple-200 font-semibold"
                        : done
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-white text-slate-500 border-slate-200"
                    }`}
                  >
                    {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                  </div>
                  {i < 4 && <span className="text-slate-300">›</span>}
                </div>
              );
            })}
          </div>

          {/* Step 1: Upload */}
          {step === "upload" && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-purple-600" />
                  Upload your spreadsheet
                </CardTitle>
                <CardDescription>
                  CSV, XLS or XLSX. Two tabs work best -- one for clients, one for orders. Single-tab files are fine too.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Input
                    ref={fileInput as any}
                    type="file"
                    accept=".csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUpload(f);
                    }}
                    disabled={busy}
                  />
                  <p className="text-xs text-slate-500">
                    5 MB max · 5,000 rows max · existing rows are de-duped, not duplicated
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  Confirm the column mapping
                </CardTitle>
                <CardDescription>
                  We've matched your columns to our fields. Anything below 70% confidence is highlighted -- have a look.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {busy && !editedMapping && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Reading the spreadsheet + asking the model...
                  </div>
                )}
                {editedMapping && sheetNames.map((sheet) => {
                  const sheetMap = editedMapping[sheet];
                  if (!sheetMap) return null;
                  const schemaKey = sheetMap.__schema__?.target;
                  const headers = Object.keys(sheetMap).filter((k) => k !== "__schema__");
                  return (
                    <div key={sheet} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{sheet}</h3>
                        {schemaKey && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            mapped as {schemaKey}
                          </Badge>
                        )}
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                        {headers.map((h) => {
                          const dec = sheetMap[h] || { target: "skip", confidence: 0 };
                          const lowConfidence = (dec.confidence ?? 0) < 0.7;
                          return (
                            <div key={h} className="px-3 py-2.5 flex flex-wrap items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-900 truncate">{h}</div>
                                <div className="text-[11px] text-slate-500 truncate">{dec.rationale || "—"}</div>
                              </div>
                              <Input
                                value={dec.target || "skip"}
                                onChange={(e) =>
                                  setEditedMapping((prev: any) => ({
                                    ...prev,
                                    [sheet]: {
                                      ...prev[sheet],
                                      [h]: { ...dec, target: e.target.value },
                                    },
                                  }))
                                }
                                className="w-44 h-8 text-xs"
                              />
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  lowConfidence
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                }`}
                              >
                                {Math.round((dec.confidence || 0) * 100)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={runPreview} disabled={busy || !editedMapping} className="bg-gradient-to-r from-purple-600 to-pink-600">
                    {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                    Build preview
                  </Button>
                  <Button variant="outline" onClick={() => runMapping()} disabled={busy}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Re-run AI
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-purple-600" />
                  Preview before commit
                </CardTitle>
                <CardDescription>
                  Per-row outcome based on your mapping. Hit commit when it looks right.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const p = job?.summary?.preview;
                  if (!p) return <p className="text-sm text-slate-500">No preview yet.</p>;

                  // Filter rows for the drilldown table.
                  const filtered = rows.filter((r) => {
                    if (rowFilter === "all") return true;
                    if (rowFilter === "errors") return r.status === "error";
                    if (rowFilter === "skipped") return r.status === "skipped";
                    if (rowFilter === "warnings") return Array.isArray(r.preview_warnings) && r.preview_warnings.length > 0;
                    return true;
                  });

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Stat label="Total rows" value={p.total} />
                        <Stat label="OK" value={p.ok} tone="emerald" />
                        <Stat label="Warnings" value={p.warnings} tone="amber" />
                        <Stat label="Errors" value={p.errors} tone="rose" />
                      </div>
                      <div className="text-xs text-slate-500">
                        Mapped to: {Object.entries(p.by_target_table || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </div>

                      {/* Drilldown filter pills */}
                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs w-fit">
                        {(["all", "errors", "warnings", "skipped"] as const).map((k) => {
                          const count =
                            k === "all" ? rows.length :
                            k === "errors" ? rows.filter((r) => r.status === "error").length :
                            k === "skipped" ? rows.filter((r) => r.status === "skipped").length :
                            rows.filter((r) => Array.isArray(r.preview_warnings) && r.preview_warnings.length > 0).length;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setRowFilter(k)}
                              className={`px-2.5 py-1 rounded-md ${
                                rowFilter === k
                                  ? "bg-purple-100 text-purple-700 font-medium"
                                  : "text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {k.charAt(0).toUpperCase() + k.slice(1)} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/*
                        Per-row drilldown. Caps at 50 rows in the
                        DOM -- if there's more, the team can navigate
                        the full set on /admin/onboarding once
                        committed. This view is for spot-checking,
                        not bulk editing.
                      */}
                      {filtered.length === 0 ? (
                        <p className="text-sm text-slate-500 italic py-3">
                          {rowFilter === "all" ? "No rows -- something's off." : `No rows in this filter.`}
                        </p>
                      ) : (
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                          <div className="max-h-[420px] overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 sticky top-0">
                                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                                  <th className="py-2 px-3">Row</th>
                                  <th className="py-2 px-3">Sheet</th>
                                  <th className="py-2 px-3">Status</th>
                                  <th className="py-2 px-3">Maps to</th>
                                  <th className="py-2 px-3">Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.slice(0, 50).map((r) => (
                                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="py-1.5 px-3 text-slate-500 font-mono">
                                      {r.source_row_index ?? "—"}
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-700">{r.sheet}</td>
                                    <td className="py-1.5 px-3">
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                                          r.status === "error"   ? "bg-rose-100 text-rose-700 border border-rose-200" :
                                          r.status === "skipped" ? "bg-slate-100 text-slate-700 border border-slate-200" :
                                          (r.preview_warnings?.length || 0) > 0
                                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                                            : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                        }`}
                                      >
                                        {r.status === "error" ? "error" :
                                         r.status === "skipped" ? "skipped" :
                                         (r.preview_warnings?.length || 0) > 0 ? "warn" : "ok"}
                                      </span>
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600">{r.target_table || "—"}</td>
                                    <td className="py-1.5 px-3 text-slate-600">
                                      {r.error_message ? (
                                        <span className="text-rose-600">{r.error_message}</span>
                                      ) : (r.preview_warnings?.length || 0) > 0 ? (
                                        <span className="text-amber-700">
                                          {r.preview_warnings!.slice(0, 2).join(" · ")}
                                          {r.preview_warnings!.length > 2 && ` +${r.preview_warnings!.length - 2}`}
                                        </span>
                                      ) : r.mapped_data ? (
                                        <span className="text-slate-500">
                                          {Object.entries(r.mapped_data).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(" · ")}
                                        </span>
                                      ) : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {filtered.length > 50 && (
                            <div className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-200">
                              Showing 50 of {filtered.length}. Commit and use Imports History for the full audit.
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <Button onClick={runCommit} disabled={busy} className="bg-gradient-to-r from-emerald-600 to-green-600">
                          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                          Commit import
                        </Button>
                        <Button variant="outline" onClick={() => setStep("mapping")} disabled={busy}>
                          Back to mapping
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Step 5: Done */}
          {step === "done" && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Import complete
                </CardTitle>
                <CardDescription>
                  {(() => {
                    const c = job?.summary?.commit;
                    if (!c) return null;
                    return `${c.clients?.inserted || 0} clients + ${c.orders?.inserted || 0} orders inserted · ${(c.clients?.skipped || 0) + (c.orders?.skipped || 0)} skipped (already on file).`;
                  })()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={runRollback} disabled={busy}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Roll back this import
                  </Button>
                  <Button variant="outline" onClick={() => { setJobId(null); setJob(null); setEditedMapping(null); setStep("upload"); }}>
                    Run another import
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500 mt-3">
                  Rollback removes only the rows this import created. Existing records and any edits since then are untouched.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Job summary footer (always visible once we have one) */}
          {job && (
            <div className="mt-6 text-xs text-slate-500 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <FileSpreadsheet className="w-3 h-3" />
                {job.source_filename || "(no filename)"}
              </span>
              <span>·</span>
              <span>{job.source_row_count ?? 0} rows</span>
              <span>·</span>
              <span className="capitalize">status: {job.status}</span>
              {job.summary?.ai_calls != null && (
                <>
                  <span>·</span>
                  <span>{job.summary.ai_calls} AI call{job.summary.ai_calls === 1 ? "" : "s"}</span>
                </>
              )}
              {job.status === "failed" && job?.summary?.failed_reason && (
                <span className="inline-flex items-center gap-1 text-rose-600">
                  <AlertTriangle className="w-3 h-3" /> {job.summary.failed_reason}
                </span>
              )}
            </div>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "amber" | "rose" }) {
  const valueClass =
    tone === "emerald" ? "text-emerald-600" :
    tone === "amber"   ? "text-amber-600"   :
    tone === "rose"    ? "text-rose-600"    : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
