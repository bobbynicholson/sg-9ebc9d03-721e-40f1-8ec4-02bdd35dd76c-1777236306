/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding -- imports history.
 *
 * The team's audit trail for every spreadsheet they've fed into the
 * AI Onboarding Importer. From here they can:
 *   - Resume a job stuck in mapping/preview
 *   - Roll back a completed job within 24h
 *   - Read the per-job summary (counts, AI usage, failures)
 *   - Start a fresh import
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wand2, Upload, RotateCcw, ArrowRight, Clock, CheckCircle2,
  AlertTriangle, FileSpreadsheet, Loader2, Trash2,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/ChatBot";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface ImportJobRow {
  id: string;
  source_filename: string | null;
  source_row_count: number | null;
  status: string;
  summary: any | null;
  created_at: string;
  completed_at: string | null;
  failed_reason: string | null;
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  uploaded:   { label: "Awaiting AI mapping", tone: "bg-amber-100 text-amber-700 border-amber-200" },
  mapped:     { label: "Mapped",              tone: "bg-blue-100 text-blue-700 border-blue-200" },
  previewed:  { label: "Preview ready",       tone: "bg-purple-100 text-purple-700 border-purple-200" },
  committing: { label: "Committing...",       tone: "bg-blue-100 text-blue-700 border-blue-200" },
  completed:  { label: "Completed",           tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  failed:     { label: "Failed",              tone: "bg-rose-100 text-rose-700 border-rose-200" },
  rolled_back:{ label: "Rolled back",         tone: "bg-slate-100 text-slate-600 border-slate-200" },
};

// Window during which a completed import is reversible. Past this
// the team has to write fixes by hand -- safer than letting them
// nuke a week of data with one click.
const ROLLBACK_HOURS = 24;

export default function ProtectedImportsHistory() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ImportsHistoryPage />
    </ProtectedRoute>
  );
}

function ImportsHistoryPage() {
  const { user } = useAuth() as any;
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;
  const { toast } = useToast();
  const router = useRouter();

  const [jobs, setJobs] = useState<ImportJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/imports");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not load imports");
      setJobs(json.jobs || []);
    } catch (e: any) {
      toast({ title: "Could not load imports", description: e?.message || "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rollback = async (jobId: string) => {
    if (!confirm("Roll back this import? This deletes the rows it inserted, existing records you had before are untouched.")) return;
    setBusyId(jobId);
    try {
      const res = await fetch(`/api/imports/${jobId}/rollback`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Rollback failed");
      toast({
        title: "Rolled back",
        description: `Removed ${json.clientsDeleted} clients + ${json.ordersDeleted} orders.`,
      });
      load();
    } catch (e: any) {
      toast({ title: "Rollback failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const discard = async (job: ImportJobRow) => {
    // Used for test runs the operator never finished mapping. Refuses
    // for completed jobs (those need rollback first to remove the live
    // data they inserted).
    const isCompleted = job.status === "completed";
    const msg = isCompleted
      ? "This import is completed and has live data. Run rollback first, then delete."
      : `Delete this import job? This removes the upload and every preview row associated with it. Existing clients / orders are untouched.`;
    if (isCompleted) {
      toast({
        title: "Cannot delete a completed import",
        description: "Run rollback first, then delete the rolled-back row.",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(msg)) return;
    setBusyId(job.id);
    try {
      const res = await fetch(`/api/imports/${job.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      toast({
        title: "Import deleted",
        description: `Removed "${job.source_filename || "(unnamed file)"}" from history.`,
      });
      load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const stats = useMemo(() => {
    const total = jobs.length;
    const completed = jobs.filter((j) => j.status === "completed").length;
    const inFlight = jobs.filter((j) => ["uploaded", "mapped", "previewed", "committing"].includes(j.status)).length;
    const failed = jobs.filter((j) => j.status === "failed").length;
    return { total, completed, inFlight, failed };
  }, [jobs]);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Imports history | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-xl mx-auto">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
                <Wand2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                  Onboarding
                  <InfoTooltip content={"This is your one-stop shop for getting your existing business into CateringMS.\n\nThree paths below cover the usual sources: a simple client list, a richer spreadsheet of clients + outstanding orders, and supplier receipts you snap on your phone. Run the right tool for the file you have, then come back here any time to roll a previous import back."} />
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Bring your existing clients, orders and supplier slips into the system. Every import shows below with a 24-hour rollback window.
                </p>
              </div>
            </div>
            <Link href={`${slugPrefix}/admin/onboarding/import`}>
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                <Upload className="w-4 h-4 mr-1.5" /> New import
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat
              label="Total imports"
              value={stats.total}
              tip={"Every import job ever started for this company, regardless of whether it finished."}
            />
            <Stat
              label="Completed"
              value={stats.completed}
              tone="emerald"
              tip={"Imports that finished cleanly. The data is now live in your clients / orders pages."}
            />
            <Stat
              label="In flight"
              value={stats.inFlight}
              tone="amber"
              tip={"Jobs you started but didn't finish. Click 'Resume' on a row below to pick up where you left off."}
            />
            <Stat
              label="Failed"
              value={stats.failed}
              tone="rose"
              tip={"Imports that hit an error. The summary on each row tells you what went wrong; you can re-run after fixing the file."}
            />
          </div>

          {/* Quick lanes. Each tile has its own info tooltip so a brand
              new tenant can hover and see exactly what each tool does
              before clicking. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Link
              href={`${slugPrefix}/admin/onboarding/clients`}
              className="group rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </span>
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  Easy client list
                  <InfoTooltip content={"The fastest way in. Drop a CSV / XLSX (or paste from Sheets) with four columns: Name, Surname, Email, Phone.\n\nWe auto-detect the headers, dedupe by email and skip rows already on file. Best for the contact list you have in Excel or Gmail today."} />
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Just Name, Surname, Email and Phone. Drop a CSV or paste from Sheets.
              </p>
            </Link>
            <Link
              href={`${slugPrefix}/admin/onboarding/import`}
              className="group rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Wand2 className="w-4 h-4" />
                </span>
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  AI importer
                  <InfoTooltip content={"For richer files. Drop a spreadsheet of clients + outstanding orders even if the column headings are weird. Claude maps the columns to our schema, you preview every row, then commit when it looks right.\n\nSupports up to 5,000 rows per upload and gives you a 24-hour rollback if anything looks off after the fact."} />
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Bigger spreadsheets with mixed columns. Claude maps headers to our schema.
              </p>
            </Link>
            <Link
              href={`${slugPrefix}/admin/onboarding/receipts`}
              className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4" />
                </span>
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  Receipt scanner
                  <InfoTooltip content={"Photograph supplier slips with your phone (up to 20 in one go). Claude vision reads each receipt and pulls the supplier, date, line items and totals so we can pre-populate your inventory cost prices.\n\nUseful on day one to seed real costs from your last few weeks of supplier purchases without typing them out."} />
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Photograph supplier slips. AI pulls suppliers, line items and totals.
              </p>
            </Link>
          </div>

          {/* List */}
          {loading ? (
            <Card><CardContent className="py-12 text-center text-slate-500">
              <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
              Loading imports...
            </CardContent></Card>
          ) : jobs.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="py-12 text-center space-y-3">
                <FileSpreadsheet className="w-14 h-14 mx-auto text-slate-300" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">No imports yet</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Drop a spreadsheet of your existing clients + orders to get rolling.
                  </p>
                </div>
                <Link href={`${slugPrefix}/admin/onboarding/import`}>
                  <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                    <Upload className="w-4 h-4 mr-1.5" /> Run your first import
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => {
                const meta = STATUS_META[j.status] || STATUS_META.uploaded;
                const ageHours =
                  j.completed_at
                    ? (Date.now() - new Date(j.completed_at).getTime()) / (1000 * 60 * 60)
                    : 0;
                const canRollback = j.status === "completed" && ageHours <= ROLLBACK_HOURS;
                const commit = j.summary?.commit;
                const inserted =
                  (commit?.clients?.inserted || 0) + (commit?.orders?.inserted || 0);
                const skipped =
                  (commit?.clients?.skipped || 0) + (commit?.orders?.skipped || 0);
                const errored =
                  (commit?.clients?.errored || 0) + (commit?.orders?.errored || 0);
                return (
                  <Card key={j.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                        <Badge className={`border ${meta.tone}`}>{meta.label}</Badge>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-semibold text-slate-900 truncate">
                          {j.source_filename || "(unnamed file)"}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(j.created_at).toLocaleString("en-ZA", {
                              day: "numeric", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                          {j.source_row_count != null && (
                            <span>{j.source_row_count} rows</span>
                          )}
                          {commit && (
                            <>
                              <span className="text-emerald-700">{inserted} inserted</span>
                              {skipped > 0 && (
                                <span className="text-slate-500">{skipped} skipped</span>
                              )}
                              {errored > 0 && (
                                <span className="text-rose-600">{errored} errored</span>
                              )}
                            </>
                          )}
                          {j.status === "failed" && j.failed_reason && (
                            <span className="inline-flex items-center gap-1 text-rose-600">
                              <AlertTriangle className="w-3 h-3" /> {j.failed_reason}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {canRollback && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rollback(j.id)}
                            disabled={busyId === j.id}
                            title={`Rollback window expires ${(ROLLBACK_HOURS - ageHours).toFixed(1)}h from now`}
                          >
                            {busyId === j.id ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Roll back
                          </Button>
                        )}
                        {!["completed", "rolled_back", "failed"].includes(j.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`${slugPrefix}/admin/onboarding/import?jobId=${j.id}`)}
                          >
                            Resume
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        )}
                        {j.status === "completed" && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 px-2">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {ageHours <= ROLLBACK_HOURS
                              ? `Rollback ${(ROLLBACK_HOURS - ageHours).toFixed(1)}h left`
                              : "Locked in"}
                          </span>
                        )}
                        {/* Delete is offered on every job that doesn't have
                            live data (i.e. anything except 'completed').
                            Useful for test uploads the operator abandoned
                            half-way through mapping. */}
                        {j.status !== "completed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Delete this import job"
                            onClick={() => discard(j)}
                            disabled={busyId === j.id}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            {busyId === j.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
    </>
  );
}

function Stat({
  label, value, tone, tip,
}: { label: string; value: number; tone?: "emerald" | "amber" | "rose"; tip?: string }) {
  const valueClass =
    tone === "emerald" ? "text-emerald-600" :
    tone === "amber"   ? "text-amber-600"   :
    tone === "rose"    ? "text-rose-600"    : "text-slate-900";
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-4">
        <p className="text-xs text-slate-600 mb-1 flex items-center gap-1.5">
          {label}
          {tip && <InfoTooltip content={tip} />}
        </p>
        <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
