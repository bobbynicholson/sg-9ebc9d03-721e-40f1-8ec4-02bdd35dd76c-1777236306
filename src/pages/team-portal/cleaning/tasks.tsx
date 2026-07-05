import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardCheck, Loader2, Check, Play, Clock, MapPin, RefreshCw, UserCheck } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { CleaningPageShell, CLEANING_HERO_CHIP } from "@/components/cleaning/CleaningPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";

interface Schedule {
  id: string;
  area_name: string | null;
  description: string | null;
  frequency: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

const statusTone: Record<string, string> = {
  pending:     "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  scheduled:   "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  completed:   "bg-brand-primary/15 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30",
  overdue:     "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
  skipped:     "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
};

// Manager dispatch (2026-07-04): who may assign tasks to team members.
const ASSIGNER_ROLES = new Set<string>([
  UserRole.CLEANING_MANAGER,
  UserRole.COMPANY_ADMIN,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.REGION_ADMIN,
  UserRole.OWNER,
].map(String));

function CleaningTasksPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [tasks, setTasks] = useState<Schedule[]>([]);
  const [team, setTeam] = useState<Array<{ id: string; full_name: string }>>([]);
  const [teamNames, setTeamNames] = useState<Map<string, string>>(new Map());
  const canAssign = ASSIGNER_ROLES.has(String((user as any)?.role || ""));
  const [loading, setLoading] = useState(true);
  // Command-centre restructure (2026-07-02): a failed read used to
  // toast once and leave the board looking empty ("everything is
  // done" over a broken connection). Failures now land here and
  // render a rose recovery card with a Retry that re-runs the loader.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"today" | "mine" | "all">("today");

  const [completing, setCompleting] = useState<Schedule | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Start button in flight - blocks a double tap firing the update twice.
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, filter]);

  // Cleaning team members for the manager's assign dropdown + assignee
  // name display on rows. Staff also need the name map to read "For X".
  useEffect(() => {
    if (!user?.company_id) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", user.company_id)
        .in("role", ["cleaning_manager", "cleaning_staff"])
        .eq("is_active", true)
        .order("full_name");
      const rows = (data || []) as Array<{ id: string; full_name: string }>;
      setTeam(rows);
      setTeamNames(new Map(rows.map((r) => [r.id, r.full_name])));
    })();
  }, [user?.company_id]);

  const assign = async (t: Schedule, assigneeId: string) => {
    if (!user?.company_id) return;
    const value = assigneeId || null;
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, assigned_to: value } : x)));
    try {
      const { error } = await supabase.from("cleaning_schedules")
        .update({ assigned_to: value, updated_at: new Date().toISOString() })
        .eq("id", t.id).eq("company_id", user.company_id);
      if (error) throw error;
      // Tell the assignee - unless the manager grabbed it for themselves.
      if (value && value !== user.id) {
        try {
          const { notificationService } = await import("@/services/notificationService");
          await notificationService.createNotification({
            company_id: user.company_id,
            recipient_id: value,
            user_id: value,
            notification_type: "cleaning_task_assigned",
            title: "Cleaning task assigned to you",
            message: `${t.area_name || "A cleaning task"}${t.scheduled_date ? ` on ${t.scheduled_date}` : ""} was assigned to you.`,
            priority: "normal",
            link: "/team-portal/cleaning/tasks",
          } as any);
        } catch (notifyErr) {
          console.warn("[cleaning/tasks] assignee notification failed (non-blocking):", notifyErr);
        }
      }
      toast({ title: value ? "Task assigned" : "Task unassigned", description: value ? `${teamNames.get(value) || "Team member"} has been notified.` : undefined });
    } catch (e: any) {
      toast({ title: "Could not assign", description: e?.message ?? undefined, variant: "destructive" });
      void load();
    }
  };

  useEffect(() => {
    if (!user?.company_id) return;
    // Unique per-mount suffix: a fixed channel name collides when the
    // page remounts fast (recurring realtime bug class in this repo).
    const channel = supabase
      .channel(`cleaning-tasks-${user.company_id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaning_schedules", filter: `company_id=eq.${user.company_id}` },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id, filter]);

  const load = async () => {
    if (!user?.company_id) return;
    // Skeleton only before the first successful load; filter switches
    // and realtime refreshes swap the data in place.
    if (!loaded) setLoading(true);
    try {
      let q = supabase
        .from("cleaning_schedules")
        .select("*")
        .eq("company_id", user.company_id)
        .neq("status", "completed")
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(100);

      if (filter === "today") q = q.eq("scheduled_date", toLocalISO(new Date()));
      if (filter === "mine" && user.id) q = q.eq("assigned_to", user.id);

      const { data, error } = await q.returns<Schedule[]>();
      if (error) throw error;
      setTasks(data || []);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Surface the failure as a recovery card; never render the
      // "everything is done" empty state over a failed load.
      setLoadError(e?.message || "We couldn't load your tasks. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const start = async (t: Schedule) => {
    if (!user?.company_id || startingId) return;
    setStartingId(t.id);
    try {
      // Supabase update errors don't throw - check the result, or a
      // failed write toasts "Task started" over a task that never moved.
      const { error } = await supabase.from("cleaning_schedules").update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", t.id).eq("company_id", user.company_id);
      if (error) throw error;
      toast({ title: "Task started" });
      await load();
    } catch (e: any) {
      toast({ title: "Could not start", description: e?.message ?? undefined, variant: "destructive" });
    } finally {
      setStartingId(null);
    }
  };

  const openComplete = (t: Schedule) => { setCompleting(t); setCompletionNotes(""); };
  const closeComplete = () => { setCompleting(null); setCompletionNotes(""); };

  const confirmComplete = async () => {
    if (!completing || !user?.id || !user?.company_id) return;
    setSaving(true);
    try {
      // Same trap as start(): supabase returns the error, it doesn't throw.
      const { error } = await supabase.from("cleaning_schedules").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        notes: completionNotes.trim() || completing.notes,
        updated_at: new Date().toISOString(),
      }).eq("id", completing.id).eq("company_id", user.company_id);
      if (error) throw error;
      toast({ title: "Task completed", description: completing.area_name ?? "" });
      closeComplete();
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === "pending" || t.status === "scheduled").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    return { total, pending, inProgress };
  }, [tasks]);

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <>
      <CleaningPageShell
        pageTitle="Cleaning tasks - CateringMS"
        heading="Task board"
        subheading={
          <>
            Scheduled checklist work lives here. Equipment returns and washing queues stay on the Cleaning desk.{" "}
            <a href={withSlug("/team-portal/cleaning/schedules")} className="underline">Open the schedule plan</a> if you need to add a new area checklist.
          </>
        }
        icon={ClipboardCheck}
        meta={
          chipsReady ? (
            <>
              <span className={CLEANING_HERO_CHIP}>
                <span className={`h-1.5 w-1.5 rounded-full ${stats.total > 0 ? "bg-amber-400" : "bg-emerald-400"}`} />
                {stats.total > 0 ? `${stats.total} open task${stats.total === 1 ? "" : "s"}` : "Nothing open"}
              </span>
              {stats.inProgress > 0 && (
                <span className={CLEANING_HERO_CHIP}>
                  <Play className="h-3 w-3" />
                  {stats.inProgress} in progress
                </span>
              )}
            </>
          ) : undefined
        }
      >
          {/* Recovery card: the load failed. Keep any last-good list
              below, but never dress a failure up as an empty board. */}
          {loadError && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
              <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load your tasks</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
              <Button
                size="sm"
                onClick={() => void load()}
                disabled={loading}
                className="bg-brand-primary hover:opacity-90 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
                Retry
              </Button>
            </div>
          )}

          {/* Tile row hides on a failed first load - all-zero tiles
              over a broken read would look like a finished day. */}
          <div className={`grid grid-cols-3 gap-3 sm:gap-4 mb-6 ${loadError && !loaded ? "hidden" : ""}`}>
            <StatTile label="Open tasks" value={stats.total} hint="Not finished yet in this view" />
            <StatTile label="Pending" value={stats.pending} hint="Scheduled, not started" />
            <StatTile label="In progress" value={stats.inProgress} hint="Started, not finished" />
          </div>

          <div className="flex gap-2 mb-4">
            {(["today", "mine", "all"] as const).map((f) => (
              <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className={filter === f ? "bg-brand-primary hover:bg-brand-primary/90 capitalize" : "capitalize"}>
                {f === "today" ? "Today" : f === "mine" ? "My tasks" : "All open"}
              </Button>
            ))}
          </div>

          <PortalCard padded={false}>
            {showSkeleton ? (
              <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading tasks">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    </div>
                    <div className="h-8 w-20 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : loadError && tasks.length === 0 ? (
              // The recovery card above owns this state; keep the card
              // body quiet instead of celebrating a false all-clear.
              <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Your tasks are unavailable right now. Use Retry above to reload them.
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-16 px-6 text-slate-500 dark:text-slate-400">
                <Check className="h-10 w-10 mx-auto mb-3 text-brand-primary dark:text-brand-primary" />
                <p className="font-medium text-slate-900 dark:text-white">No open cleaning tasks</p>
                <p className="text-xs mt-1">
                  {filter === "today"
                    ? "Nothing scheduled for today in this view."
                    : filter === "mine"
                      ? "Nothing assigned to you right now."
                      : "Everything is done."}
                </p>
                <div className="mt-4 flex justify-center">
                  {filter !== "all" ? (
                    <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                      View all open tasks
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <a href={withSlug("/team-portal/cleaning/schedules")}>Plan a schedule</a>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {tasks.map((t) => (
                  <li key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900 dark:text-white">{t.area_name ?? "Cleaning task"}</span>
                        {t.status && (
                          <Badge variant="outline" className={`${statusTone[t.status] ?? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"} text-xs capitalize`}>
                            {t.status.replace("_", " ")}
                          </Badge>
                        )}
                        {t.frequency && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs capitalize">{t.frequency}</Badge>
                        )}
                      </div>
                      {t.description && <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{t.description}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {t.scheduled_date && <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400 dark:text-slate-500" />{t.scheduled_date}</span>}
                        {t.scheduled_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />{t.scheduled_time.slice(0, 5)}</span>}
                      </div>
                      {/* Assignment: manager picks the team member; staff see
                          who the task is for. */}
                      {canAssign && t.status !== "completed" ? (
                        <label className="mt-1.5 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                          <UserCheck className="h-3 w-3 text-brand-primary flex-shrink-0" />
                          <select
                            value={t.assigned_to || ""}
                            onChange={(e) => assign(t, e.target.value)}
                            className="text-xs border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 bg-white dark:bg-slate-900 max-w-[180px]"
                            aria-label="Assign task to team member"
                          >
                            <option value="">Unassigned</option>
                            {team.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name}{m.id === user?.id ? " (me)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : t.assigned_to ? (
                        <p className={"mt-1 flex items-center gap-1 text-xs " + (t.assigned_to === user?.id ? "text-brand-primary font-semibold" : "text-slate-500 dark:text-slate-400")}>
                          <UserCheck className="h-3 w-3 flex-shrink-0" />
                          {t.assigned_to === user?.id ? "Assigned to you" : `For ${teamNames.get(t.assigned_to) || "team member"}`}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {t.status === "in_progress" ? (
                        <Button size="sm" onClick={() => openComplete(t)} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
                          <Check className="h-4 w-4 mr-1" />Done
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => start(t)} disabled={startingId !== null}>
                            {startingId === t.id
                              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Starting</>
                              : <><Play className="h-4 w-4 mr-1" />Start</>}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openComplete(t)} disabled={startingId !== null}>
                            <Check className="h-4 w-4 mr-1" />Mark done
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PortalCard>
      </CleaningPageShell>

      <Dialog open={!!completing} onOpenChange={(o) => !o && closeComplete()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete task</DialogTitle>
            <DialogDescription>{completing?.area_name}{completing?.description ? `, ${completing.description}` : ""}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder="Optional notes, e.g. 'mopped twice, restocked detergent, no issues'"
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeComplete} disabled={saving}>Cancel</Button>
            <Button onClick={confirmComplete} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Mark complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CleaningTasksPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.CLEANING_MANAGER,
        UserRole.CLEANING_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <CleaningTasksPageInner />
    </ProtectedRoute>
  );
}
