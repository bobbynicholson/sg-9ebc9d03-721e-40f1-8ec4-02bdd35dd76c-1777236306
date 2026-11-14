/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader, PageWorkbench, PortalCard, StatTile } from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Search, RefreshCw, Timer, CircleDashed } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type TaskStatus = "never_run" | "running" | "succeeded" | "failed" | "stuck" | "overdue";
type ScheduledTask = {
  taskKey: string;
  path: string;
  schedule: string;
  status: TaskStatus;
  lastRunStatus: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastHttpStatus: number | null;
  lastError: string | null;
  lastTriggerSource: string | null;
  nextRunAt: string | null;
  overdueByMinutes: number;
  stuckForMinutes: number;
  openIncidentCount: number;
  incidents: Array<{
    status: "failed" | "stuck" | "overdue";
    detectedAt: string;
    startedAt: string | null;
    message: string;
    resolvedAt: string | null;
    runId: string | null;
  }>;
};
type PayFastException = {
  id: string;
  transactionId: string;
  reason: string;
  attempts: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

function CronTasksPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [payfastExceptions, setPayfastExceptions] = useState<PayFastException[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "running" | "succeeded" | "never_run">("all");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/admin/cron-task-status", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Task monitor returned HTTP ${response.status}`);
      setTasks(payload.tasks || []);
      setPayfastExceptions(payload.payfastExceptions || []);
      setCheckedAt(payload.checkedAt || null);
      setError(null);
    } catch (cause: any) {
      setError(cause?.message || "Scheduled task status could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 60_000);
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [load]);

  const counts = useMemo(() => ({
    total: tasks.length,
    attention: tasks.filter((task) => ["failed", "stuck", "overdue"].includes(task.status)).length,
    running: tasks.filter((task) => task.status === "running").length,
    succeeded: tasks.filter((task) => task.lastRunStatus === "succeeded").length,
    neverRun: tasks.filter((task) => task.lastRunStatus === "never_run").length,
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesSearch = !query || `${task.taskKey} ${task.path} ${task.schedule}`.toLowerCase().includes(query);
      const matchesFilter = filter === "all"
        || (filter === "attention" && ["failed", "stuck", "overdue"].includes(task.status))
        || (filter === "running" && task.status === "running")
        || (filter === "succeeded" && task.lastRunStatus === "succeeded")
        || (filter === "never_run" && task.lastRunStatus === "never_run");
      return matchesSearch && matchesFilter;
    });
  }, [tasks, search, filter]);

  const statusLabel: Record<TaskStatus, string> = {
    never_run: "No run recorded",
    running: "Running",
    succeeded: "Healthy",
    failed: "Failed",
    stuck: "Stuck",
    overdue: "Overdue",
  };
  const statusClass: Record<TaskStatus, string> = {
    never_run: "border-slate-200 bg-slate-50 text-slate-600",
    running: "border-sky-200 bg-sky-50 text-sky-700",
    succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
    failed: "border-rose-200 bg-rose-50 text-rose-700",
    stuck: "border-rose-200 bg-rose-50 text-rose-700",
    overdue: "border-amber-200 bg-amber-50 text-amber-800",
  };
  const statusIcon: Record<TaskStatus, typeof Activity> = {
    never_run: CircleDashed,
    running: RefreshCw,
    succeeded: CheckCircle2,
    failed: AlertTriangle,
    stuck: AlertTriangle,
    overdue: Clock3,
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Scheduled tasks - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Scheduled tasks"
            subtitle="See when each scheduled job last ran, whether it failed or stalled, and when it is due next."
            icon={Activity}
            actions={(
              <Button variant="outline" onClick={() => void load(true)} disabled={refreshing} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </Button>
            )}
          />
          <PageWorkbench />

          {payfastExceptions.length > 0 && (
            <PortalCard className="mb-5 border-amber-300 bg-amber-50/70 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-amber-950">
                    {payfastExceptions.length} PayFast history {payfastExceptions.length === 1 ? "record needs" : "records need"} review
                  </h2>
                  <p className="mt-1 text-sm text-amber-900">
                    These rows remain quarantined while history recovery continues. A payment is only posted after it matches a saved checkout; verify the provider reference before repairing a checkout link.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {payfastExceptions.slice(0, 10).map((exception) => (
                      <li key={exception.id} className="rounded-lg border border-amber-200 bg-white/80 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium text-slate-900">Provider transaction {exception.transactionId || "unknown"}</span>
                          <span className="text-xs text-slate-500">First seen {formatDistanceToNow(new Date(exception.firstSeenAt), { addSuffix: true })}</span>
                        </div>
                        <p className="mt-1 break-words text-amber-900">{exception.reason}</p>
                      </li>
                    ))}
                  </ul>
                  {payfastExceptions.length > 10 && (
                    <p className="mt-2 text-xs text-amber-900">Showing the 10 oldest records; newer exceptions are also saved for review.</p>
                  )}
                </div>
              </div>
            </PortalCard>
          )}

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Scheduled jobs" value={counts.total} hint="Configured in Vercel" icon={Activity} />
            <StatTile label="Need attention" value={counts.attention} hint="Failed, overdue, or stuck" icon={AlertTriangle} />
            <StatTile label="Running now" value={counts.running} hint="Latest invocation active" icon={RefreshCw} />
            <StatTile label="Last run healthy" value={counts.succeeded} hint="Most recent recorded result" icon={CheckCircle2} />
            <StatTile label="No run recorded" value={counts.neverRun} hint="Since monitoring started" icon={CircleDashed} />
          </div>

          <PortalCard className="mb-5 p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search scheduled jobs…" className="pl-9" />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter scheduled tasks">
                {([
                  ["all", "All"], ["attention", "Needs attention"], ["running", "Running"], ["succeeded", "Healthy"], ["never_run", "No run yet"],
                ] as const).map(([value, label]) => (
                  <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
                    {label}{value === "all" ? ` (${counts.total})` : value === "attention" ? ` (${counts.attention})` : ""}
                  </Button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Schedules are UTC. Next-run times use your device&apos;s local timezone.
              {checkedAt && ` Status checked ${formatDistanceToNow(new Date(checkedAt), { addSuffix: true })}.`}
              {" "}This page refreshes every minute while open.
            </p>
          </PortalCard>

          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <div className="space-y-3" aria-live="polite">
            {loading && tasks.length === 0 ? (
              <PortalCard className="p-8 text-center text-sm text-slate-500">Loading scheduled task status…</PortalCard>
            ) : visibleTasks.length === 0 ? (
              <PortalCard className="p-8 text-center text-sm text-slate-500">No scheduled tasks match this filter.</PortalCard>
            ) : visibleTasks.map((task) => {
              const Icon = statusIcon[task.status];
              const title = task.taskKey.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
              return (
                <PortalCard key={task.taskKey} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold capitalize text-slate-900">{title}</h2>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[task.status]}`}>
                          <Icon className={`mr-1.5 h-3.5 w-3.5 ${task.status === "running" ? "animate-spin" : ""}`} />
                          {statusLabel[task.status]}
                        </span>
                        {task.lastTriggerSource && <span className="text-xs text-slate-500">Triggered by {task.lastTriggerSource === "cron" ? "scheduler" : "admin"}</span>}
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-slate-500">{task.path}</div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-slate-400" />Schedule <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{task.schedule} UTC</code></span>
                        <span className="inline-flex items-center gap-1.5"><Timer className="h-4 w-4 text-slate-400" />
                          {task.lastStartedAt
                            ? `Last started ${formatDistanceToNow(new Date(task.lastStartedAt), { addSuffix: true })}`
                            : "No run recorded since monitoring started"}
                          {task.lastDurationMs != null && ` · ${Math.max(1, Math.round(task.lastDurationMs / 1000))} sec`}
                        </span>
                      </div>
                      {(task.lastError || task.status === "stuck" || task.status === "overdue") && (
                        <p className="mt-2 text-sm text-rose-700">
                          {task.lastError || (task.status === "stuck"
                            ? `No response recorded; running for ${task.stuckForMinutes} minutes.`
                            : task.status === "overdue"
                              ? `Next scheduled run is overdue by ${task.overdueByMinutes} minutes.`
                              : "The latest task run reported an error. See incident history for details.")}
                        </p>
                      )}
                      {task.incidents.length > 0 && (
                        <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
                          <summary className="cursor-pointer text-sm font-medium text-amber-950">
                            Incident history ({task.openIncidentCount} open, {task.incidents.length} shown)
                          </summary>
                          <ul className="mt-2 space-y-2">
                            {task.incidents.map((incident, index) => (
                              <li key={`${incident.runId || incident.detectedAt}-${incident.status}-${index}`} className="rounded-md border border-amber-200/80 bg-white/80 p-2.5 text-sm">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-semibold capitalize text-slate-900">{incident.status}</span>
                                  <span className={incident.resolvedAt ? "text-emerald-700" : "text-rose-700"}>
                                    {incident.resolvedAt ? `Recovered ${formatDistanceToNow(new Date(incident.resolvedAt), { addSuffix: true })}` : "Still open"}
                                  </span>
                                  <span className="text-xs text-slate-500">Detected {formatDistanceToNow(new Date(incident.detectedAt), { addSuffix: true })}</span>
                                </div>
                                <p className="mt-1 break-words text-slate-700">{incident.message}</p>
                                {incident.runId && <p className="mt-1 break-all font-mono text-[11px] text-slate-500">Run {incident.runId}</p>}
                              </li>
                            ))}
                          </ul>
                          {task.incidents.length === 10 && <p className="mt-2 text-xs text-slate-500">Showing the latest 10 incidents for this task.</p>}
                        </details>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[390px] xl:shrink-0">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Next scheduled run</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {task.nextRunAt ? new Date(task.nextRunAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not available"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Last result</div>
                        <div className="mt-1 text-sm font-semibold capitalize text-slate-900">
                          {task.lastRunStatus.replace(/_/g, " ")}{task.lastHttpStatus ? ` · HTTP ${task.lastHttpStatus}` : ""}
                        </div>
                        {task.lastFinishedAt && <div className="mt-0.5 text-xs text-slate-500">Finished {formatDistanceToNow(new Date(task.lastFinishedAt), { addSuffix: true })}</div>}
                      </div>
                    </div>
                  </div>
                </PortalCard>
              );
            })}
          </div>
        </PortalShell>
      </div>
      <Footer />
    </>
  );
}

export default function ProtectedCronTasksPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <CronTasksPage />
    </ProtectedRoute>
  );
}
