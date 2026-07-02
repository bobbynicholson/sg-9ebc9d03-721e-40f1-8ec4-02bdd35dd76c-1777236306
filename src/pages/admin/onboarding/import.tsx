/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding/import (slug-aware: /[slug]/admin/onboarding/import)
 *
 * The catering team's upload-and-go onboarding tool. Five-step
 * wizard:
 *   1. Upload  - drop a .xlsx / .csv with clients + orders
 *   2. Mapping - AI returns a header -> field mapping with
 *                 confidence; the team eyeballs and confirms
 *   3. Preview - per-row outcome preview (insert / skip / error)
 *   4. Commit  - apply, persist, stamp import_job_id for rollback
 *   5. Done    - summary + rollback CTA
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
  AlertTriangle, FileSpreadsheet, Wand2, Bot,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/ChatBot";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyKitchens } from "@/hooks/useCompanyKitchens";
import { Building2 } from "lucide-react";
import { PortalShell, PortalHeader, PageWorkbench } from "@/components/portal/ui";

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
  // Phase 3a dedup fields. Stamped by the preview API when the row's
  // email matches an existing client / lead.
  dedup_match_id: string | null;
  dedup_match_table: string | null;
  dedup_decision: "skip" | "update" | "create_new" | null;
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

  // Branch / kitchen scoping for the imported rows. Only matters for
  // multi-branch tenants - single-branch operators get the only
  // option auto-selected and the picker hides itself in the UI.
  const { kitchens } = useCompanyKitchens(companyId);
  const branchOptions = useMemo(
    () => kitchens.filter((k) => k.source === "region"),
    [kitchens],
  );
  const [importRegionId, setImportRegionId] = useState<string | null>(null);
  useEffect(() => {
    if (!importRegionId && branchOptions.length === 1) {
      setImportRegionId(branchOptions[0].id);
    }
  }, [branchOptions, importRegionId]);

  // Local edits to the AI mapping before the team confirms it.
  const [editedMapping, setEditedMapping] = useState<any>(null);

  // Drilldown filter for the preview step row table.
  const [rowFilter, setRowFilter] = useState<"all" | "warnings" | "errors" | "skipped" | "duplicates">("all");
  const [bulkDedupBusy, setBulkDedupBusy] = useState(false);

  // Per-row dedup decision setter - writes through the API so
  // commit picks up the choice. Optimistic UI: state flips first,
  // server call patches the persisted record.
  const setRowDecision = async (rowId: string, decision: "skip" | "update" | "create_new") => {
    if (!jobId) return;
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, dedup_decision: decision } : r));
    try {
      const res = await fetch(`/api/imports/${jobId}/rows/${rowId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Server returned ${res.status}`);
      }
    } catch (e: any) {
      toast({ title: "Couldn't save decision", description: e?.message, variant: "destructive" });
      // Revert the optimistic flip to whatever the server has.
      await refreshJob(jobId, true);
    }
  };

  // Bulk apply - skip all dupes, update all dupes, or create new for
  // all dupes. Fires decision calls in parallel batches of 50.
  const setAllDuplicateDecisions = async (decision: "skip" | "update" | "create_new") => {
    if (!jobId) return;
    const targets = rows.filter((r) => r.dedup_match_id);
    if (targets.length === 0) {
      toast({ title: "No duplicates to update" });
      return;
    }
    setBulkDedupBusy(true);
    setRows((prev) => prev.map((r) => r.dedup_match_id ? { ...r, dedup_decision: decision } : r));
    try {
      const BATCH = 50;
      let failed = 0;
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH);
        const results = await Promise.all(batch.map((r) =>
          fetch(`/api/imports/${jobId}/rows/${r.id}/decision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision }),
          }).catch(() => null),
        ));
        // Promise.all on fetch never rejects on HTTP errors - count
        // non-ok responses or the optimistic UI lies about what commit
        // will actually do to those rows.
        failed += results.filter((res) => !res || !res.ok).length;
      }
      if (failed > 0) {
        throw new Error(`${failed} of ${targets.length} rows did not save. Reloading the saved decisions.`);
      }
      const label = decision === "skip" ? "Skip all" : decision === "update" ? "Update existing" : "Create new";
      toast({ title: `${label} applied to ${targets.length} duplicates` });
    } catch (e: any) {
      toast({ title: "Bulk update failed", description: e?.message, variant: "destructive" });
      // Re-sync the table with what the server actually persisted so
      // the optimistic flip doesn't stand in for saved state.
      await refreshJob(jobId, true);
    } finally {
      setBulkDedupBusy(false);
    }
  };

  const fileInput = useRef<HTMLInputElement | null>(null);

  // Track which rows are currently being repaired by Claude so the UI
  // can disable the button + show a spinner without blocking the rest
  // of the table.
  const [repairingRowIds, setRepairingRowIds] = useState<Set<string>>(new Set());

  const repairRow = async (rowId: string) => {
    if (!jobId) return;
    setRepairingRowIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
    try {
      const res = await fetch(`/api/imports/${jobId}/rows/${rowId}/repair`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Repair failed");
      toast({
        title: "AI repair applied",
        description: json.result?.rationale || "Row updated, review the new mapping below.",
      });
      // Re-pull the rows so the table reflects the fix.
      await refreshJob(jobId, true);
    } catch (e: any) {
      toast({ title: "AI repair failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setRepairingRowIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

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

  // Persistent banner when the job itself can't be loaded (resume via
  // ?jobId, or a refresh after a repair). Pre-fix this only toasted,
  // and a network throw here escaped as an unhandled rejection.
  const [jobLoadError, setJobLoadError] = useState<string | null>(null);

  const refreshJob = async (id: string, withRows = false) => {
    try {
      const res = await fetch(`/api/imports/${id}${withRows ? "?rows=1" : ""}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Server returned ${res.status}`);
      setJobLoadError(null);
      setJob(json.job);
      if (json.rows) setRows(json.rows as RowShape[]);
      if (json.job?.mapping && !editedMapping) setEditedMapping(json.job.mapping);
    } catch (e: any) {
      setJobLoadError(e?.message || "Could not load the import job.");
      toast({ title: "Could not load import", description: e?.message || "", variant: "destructive" });
    }
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

      // Auto-mapping shortcut. If the upload endpoint recognised the
      // headers as a known template, it already wrote the mapping and
      // flipped the job to "mapped". Run preview inline and jump
      // straight to the preview step - saves the operator the
      // mapping ceremony when their file is template-clean.
      if (json.autoMappedTo) {
        toast({
          title: "Template recognised",
          description: `Headers matched the ${json.autoMappedTo} template. Skipping the mapping step.`,
        });
        try {
          const pr = await fetch(`/api/imports/${json.jobId}/preview`, { method: "POST" });
          const raw = await pr.text();
          let pj: any = {};
          try { pj = raw ? JSON.parse(raw) : {}; } catch {
            pj = { error: raw.slice(0, 280) || `Server returned ${pr.status}` };
          }
          if (!pr.ok) throw new Error(pj?.error || `Preview failed (${pr.status})`);
          await refreshJob(json.jobId, true);
          setStep("preview");
        } catch (e: any) {
          toast({ title: "Preview failed", description: e?.message || "", variant: "destructive" });
        }
        return;
      }

      setStep("mapping");
      // Kick the AI mapping immediately - the team usually waits
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
      // Defensive parse - if the function timed out or hit an infra
      // error, the body may be plain text ("An error occurred...")
      // and res.json() throws an unhelpful "Unexpected token A".
      const raw = await res.text();
      let json: any = {};
      try { json = raw ? JSON.parse(raw) : {}; } catch {
        // Non-JSON response. Treat the body as the error message.
        json = { error: raw.slice(0, 280) || `Server returned ${res.status}` };
      }
      if (!res.ok) {
        throw new Error(
          json?.error
          || (res.status === 504 ? "Preview took too long. Try splitting the file into smaller batches." : `Preview failed (${res.status})`)
        );
      }
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
      const res = await fetch(`/api/imports/${jobId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region_id: importRegionId }),
      });
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
    if (!confirm("Roll back this import? This deletes the rows the import inserted, existing records you had before are untouched.")) return;
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
        <title>AI import - CateringMS</title>
      </Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title={
              <span className="inline-flex items-center gap-2">
                AI Import
                <InfoTooltip content={"Five-step wizard for moving your existing book of business into CateringMS in one go.\n\nUpload, then we map your column headings to our schema. You preview every row before anything is committed, and you have a 24-hour rollback window if anything looks wrong after."} />
              </span>
            }
            subtitle="Drop a spreadsheet of your existing clients and outstanding orders. We match the columns, normalise the data, show you a preview, then load it."
            icon={Wand2}
            meta={
              job ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <FileSpreadsheet className="h-3 w-3" />
                    {job.source_filename || "(no filename)"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {job.source_row_count ?? 0} rows
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${job.status === "failed" ? "bg-rose-400" : job.status === "completed" ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {job.status.replace(/_/g, " ")}
                  </span>
                </>
              ) : undefined
            }
          />
          <PageWorkbench />

          {/* Stepper. Each pill has its own info tooltip so a brand-new
              tenant can hover and understand what each step does. */}
          <div className="mb-6 flex items-center gap-2 text-xs">
            {(["upload", "mapping", "preview", "commit", "done"] as Step[]).map((s, i) => {
              const active = stepIndex(step) === i;
              const done = stepIndex(step) > i;
              const tip =
                s === "upload"  ? "Step 1. Drop your spreadsheet. CSV or XLSX, up to 5 MB and 5,000 rows. Two tabs (one for clients, one for orders) is the cleanest shape, but a single sheet works too."
                : s === "mapping" ? "Step 2. We read your column headings and propose a mapping to our fields (Name, Email, Phone, Event date, Total, etc.). You can override any guess before moving on."
                : s === "preview" ? "Step 3. We run every row through the validation pipeline and show you what will happen: insert, skip (already exists), or error. Fix anything you don't like before committing."
                : s === "commit"  ? "Step 4. Apply the import. Each new row gets stamped with this job's id so we can roll the whole thing back inside 24 hours if anything looks off afterwards."
                : "Step 5. Summary of what landed. From here you can roll back, view the rows, or jump straight to Clients / Orders to start working with the new data.";
              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                      active
                        ? "bg-slate-100 text-slate-700 border-slate-200 font-semibold"
                        : done
                          ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                          : "bg-white text-slate-500 border-slate-200"
                    }`}
                  >
                    <span>{i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    <InfoTooltip content={tip} />
                  </div>
                  {i < 4 && <span className="text-slate-300">›</span>}
                </div>
              );
            })}
          </div>

          {/* Job load failure - shown with a retry so a resumed job that
              failed to fetch isn't a silent dead end on the upload step. */}
          {jobLoadError && jobId && (
            <Card className="mb-4 border-rose-200 bg-rose-50">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-rose-900">Couldn&apos;t load this import job</p>
                    <p className="text-xs text-rose-800/80 mt-0.5">{jobLoadError}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshJob(jobId, true)}
                  disabled={busy}
                  className="bg-white"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-slate-600" />
                  Upload your spreadsheet
                  <InfoTooltip content={"Drop a CSV or XLSX with the data you want to bring across.\n\nIdeal shape: two sheets named 'clients' and 'orders'. We accept any column headings; we map them in the next step.\n\nIf it's just a contact list, the simpler 'Easy client list' tool may be a faster fit."} />
                </CardTitle>
                <CardDescription>
                  CSV, XLS or XLSX. Two tabs work best, one for clients and one for orders. Single-tab files are fine too.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Template download buttons. Using one of these
                      auto-recognises every column on the upload step
                      and skips the AI mapping step entirely - the
                      wizard jumps straight to Preview. */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { window.location.href = "/api/imports/templates/clients"; }}
                      className="gap-1.5"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Download clients template
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { window.location.href = "/api/imports/templates/leads"; }}
                      className="gap-1.5"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Download leads template
                    </Button>
                  </div>
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
                    5 MB max. Row cap is set in SaaS settings (currently 200 by default). Existing rows are de-duped, not duplicated.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Mapping */}
          {step === "mapping" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-slate-600" />
                  Confirm the column mapping
                </CardTitle>
                <CardDescription>
                  We've matched your columns to our fields. Anything below 70% confidence is highlighted, have a look.
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
                                <div className="text-[11px] text-slate-500 truncate">{dec.rationale || "-"}</div>
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
                                    : "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
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
                  <Button onClick={runPreview} disabled={busy || !editedMapping} className="bg-brand-primary">
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-slate-600" />
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

                  // Defensive parse for preview_warnings - supabase-js
                  // sometimes returns text[] as a Postgres-array string
                  // ('{"a","b"}') rather than a JS array. Coerce both
                  // shapes to a real array so the filter and the
                  // per-row notes never silently miss rows.
                  const warningsList = (r: RowShape): string[] => {
                    const w = r.preview_warnings as unknown;
                    if (Array.isArray(w)) return w as string[];
                    if (typeof w === "string" && w.length > 0 && w !== "[]" && w !== "{}") {
                      try {
                        const parsed = JSON.parse(w);
                        if (Array.isArray(parsed)) return parsed as string[];
                      } catch {
                        // Fallback: Postgres array literal '{"a","b"}'
                        const inner = w.replace(/^\{|\}$/g, "");
                        if (inner.length > 0) return inner.split(",").map((s) => s.replace(/^"|"$/g, ""));
                      }
                    }
                    return [];
                  };
                  const hasWarnings = (r: RowShape) => warningsList(r).length > 0;

                  // Filter rows for the drilldown table.
                  const filtered = rows.filter((r) => {
                    if (rowFilter === "all") return true;
                    if (rowFilter === "errors") return r.status === "error";
                    if (rowFilter === "skipped") return r.status === "skipped";
                    if (rowFilter === "warnings") return hasWarnings(r);
                    if (rowFilter === "duplicates") return !!r.dedup_match_id;
                    return true;
                  });

                  // Sample warning messages so the stat tile shows
                  // *what* the warnings say, not just a count - when
                  // the row table has 1000 cap and the warning row is
                  // outside, the operator still gets the message.
                  const warningSamples = rows
                    .map(warningsList)
                    .filter((arr) => arr.length > 0)
                    .flat()
                    .slice(0, 5);

                  const dupeRows = rows.filter((r) => r.dedup_match_id);
                  const dupeSkip = dupeRows.filter((r) => (r.dedup_decision || "skip") === "skip").length;
                  const dupeUpdate = dupeRows.filter((r) => r.dedup_decision === "update").length;
                  const dupeCreate = dupeRows.filter((r) => r.dedup_decision === "create_new").length;

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <Stat label="Total rows" value={p.total} />
                        <Stat label="OK" value={p.ok} tone="emerald" />
                        <Stat label="Duplicates" value={p.duplicates ?? dupeRows.length} tone="amber" />
                        <Stat label="Warnings" value={p.warnings} tone="amber" />
                        <Stat label="Errors" value={p.errors} tone="rose" />
                      </div>

                      {/* Duplicates banner - shown only when matches exist.
                          Default decision is 'skip' so the import is safe
                          if the operator does nothing. Bulk actions let
                          them flip the whole set in one go. */}
                      {dupeRows.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-amber-900">
                                {dupeRows.length} {dupeRows.length === 1 ? "row matches an existing record" : "rows match existing records"}
                              </p>
                              <p className="text-xs text-amber-800/80 mt-0.5">
                                Default is to skip these on commit. Switch any row to "update existing" to overwrite the saved record's fields, or "create new" to keep both side by side.
                                {" "}Currently: <strong>{dupeSkip}</strong> skip · <strong>{dupeUpdate}</strong> update · <strong>{dupeCreate}</strong> create new.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pl-6">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={bulkDedupBusy}
                              onClick={() => setAllDuplicateDecisions("skip")}
                              className="h-7 text-[11px] bg-white"
                            >
                              Skip all duplicates
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={bulkDedupBusy}
                              onClick={() => setAllDuplicateDecisions("update")}
                              className="h-7 text-[11px] bg-white"
                            >
                              Update all existing records
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={bulkDedupBusy}
                              onClick={() => setAllDuplicateDecisions("create_new")}
                              className="h-7 text-[11px] bg-white"
                            >
                              Create new for all
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setRowFilter("duplicates")}
                              className="h-7 text-[11px] ml-auto"
                            >
                              Review duplicates →
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="text-xs text-slate-500">
                        Mapped to: {Object.entries(p.by_target_table || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </div>

                      {/* Warning sample strip. When count says "1 warning"
                          but the row's outside the visible 50, the
                          operator otherwise sees a dead-end "no rows".
                          Show actual warning text up front so they
                          have context to decide. */}
                      {warningSamples.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-amber-900 mb-1">
                                {p.warnings} warning{p.warnings === 1 ? "" : "s"} flagged
                              </p>
                              <ul className="text-xs text-amber-800/90 space-y-0.5">
                                {warningSamples.map((w, i) => (
                                  <li key={i}>• {w}</li>
                                ))}
                              </ul>
                              <p className="text-[10px] text-amber-700/70 mt-1.5">
                                Warnings don't block import. The row still commits, just flagged for review afterwards. Click "Warnings" below to see which rows.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Drilldown filter pills */}
                      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs w-fit">
                        {(["all", "duplicates", "errors", "warnings", "skipped"] as const).map((k) => {
                          const count =
                            k === "all" ? rows.length :
                            k === "duplicates" ? dupeRows.length :
                            k === "errors" ? rows.filter((r) => r.status === "error").length :
                            k === "skipped" ? rows.filter((r) => r.status === "skipped").length :
                            rows.filter(hasWarnings).length;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setRowFilter(k)}
                              className={`px-2.5 py-1 rounded-md ${
                                rowFilter === k
                                  ? "bg-slate-100 text-slate-700 font-medium"
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
                        DOM, if there's more, the team can navigate
                        the full set on /admin/onboarding once
                        committed. This view is for spot-checking,
                        not bulk editing.
                      */}
                      {filtered.length === 0 ? (
                        <p className="text-sm text-slate-500 italic py-3">
                          {rowFilter === "all" ? "No rows, something's off." : `No rows in this filter.`}
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
                                  <th className="py-2 px-3 w-32">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.slice(0, 50).map((r) => {
                                  const hasIssue =
                                    r.status === "error" ||
                                    r.status === "skipped" ||
                                    (r.preview_warnings?.length || 0) > 0;
                                  const aiRepairNote = (r.source_data as any)?.__ai_repair?.rationale as string | undefined;
                                  const repairing = repairingRowIds.has(r.id);
                                  return (
                                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="py-1.5 px-3 text-slate-500 font-mono">
                                      {r.source_row_index ?? "-"}
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-700">{r.sheet}</td>
                                    <td className="py-1.5 px-3">
                                      <div className="flex items-center gap-1">
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                                            r.status === "error"   ? "bg-rose-100 text-rose-700 border border-rose-200" :
                                            r.status === "skipped" ? "bg-slate-100 text-slate-700 border border-slate-200" :
                                            (r.preview_warnings?.length || 0) > 0
                                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                                              : "bg-brand-primary/15 text-brand-primary border border-brand-primary/20"
                                          }`}
                                        >
                                          {r.status === "error" ? "error" :
                                           r.status === "skipped" ? "skipped" :
                                           (r.preview_warnings?.length || 0) > 0 ? "warn" : "ok"}
                                        </span>
                                        {r.dedup_match_id && (
                                          <span
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                                            title="Email matches an existing record"
                                          >
                                            dupe
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600">{r.target_table || "-"}</td>
                                    <td className="py-1.5 px-3 text-slate-600">
                                      {(() => {
                                        const ws = warningsList(r);
                                        return r.error_message ? (
                                          <span className="text-rose-600">{r.error_message}</span>
                                        ) : ws.length > 0 ? (
                                          <span className="text-amber-700">
                                            {ws.slice(0, 2).join(" · ")}
                                            {ws.length > 2 && ` +${ws.length - 2}`}
                                          </span>
                                        ) : r.mapped_data ? (
                                        <span className="text-slate-500">
                                          {Object.entries(r.mapped_data).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(" · ")}
                                        </span>
                                      ) : "-";
                                      })()}
                                      {r.dedup_match_id && (
                                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                          <AlertTriangle className="w-3 h-3" />
                                          On file as {r.dedup_match_table}: {(r.mapped_data?.email || r.mapped_data?.client_email || "").toString().slice(0, 40)}
                                        </div>
                                      )}
                                      {aiRepairNote && (
                                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                                          <Bot className="w-3 h-3" />
                                          AI: {aiRepairNote.slice(0, 90)}{aiRepairNote.length > 90 ? "..." : ""}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-1.5 px-3">
                                      {r.dedup_match_id ? (
                                        <select
                                          value={(r.dedup_decision || "skip") as string}
                                          onChange={(e) => setRowDecision(r.id, e.target.value as "skip" | "update" | "create_new")}
                                          className="h-7 text-[11px] border border-amber-300 bg-amber-50 rounded px-1.5"
                                          title="How to handle this duplicate at commit time"
                                        >
                                          <option value="skip">Skip</option>
                                          <option value="update">Update existing</option>
                                          <option value="create_new">Create new</option>
                                        </select>
                                      ) : hasIssue ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={repairing}
                                          onClick={() => repairRow(r.id)}
                                          className="h-7 text-[11px] gap-1.5"
                                          title="Auto-repair this row's broken cells"
                                        >
                                          {repairing ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <Bot className="w-3 h-3" />
                                          )}
                                          {repairing ? "Repairing" : "AI repair"}
                                        </Button>
                                      ) : (
                                        <span className="text-[11px] text-slate-400">-</span>
                                      )}
                                    </td>
                                  </tr>
                                  );
                                })}
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

                      {branchOptions.length > 1 && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 mt-2">
                          <div className="flex items-center gap-1.5 text-sm font-medium text-blue-900 mb-1">
                            <Building2 className="w-4 h-4" /> Target branch
                          </div>
                          <p className="text-xs text-blue-800/70 mb-2">
                            Every imported client and order will be stamped to this branch.
                            You can leave it as "Unassigned" to import without a branch.
                          </p>
                          <select
                            value={importRegionId || ""}
                            onChange={(e) => setImportRegionId(e.target.value || null)}
                            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="">Unassigned (no branch)</option>
                            {branchOptions.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.name}
                                {k.address ? ` · ${k.address}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <Button onClick={runCommit} disabled={busy} className="bg-brand-primary">
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-brand-primary" />
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
        </PortalShell>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "amber" | "rose" }) {
  // Outcome tones stay semantic (emerald good / amber warn / rose bad),
  // never rebranded to the tenant palette.
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
