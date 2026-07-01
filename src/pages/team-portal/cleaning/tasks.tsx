import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardCheck, Loader2, Check, Play, Clock, MapPin } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalShell, PortalHeader, PortalCard, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
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

function CleaningTasksPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const [tasks, setTasks] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"today" | "mine" | "all">("today");

  const [completing, setCompleting] = useState<Schedule | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, filter]);

  useEffect(() => {
    if (!user?.company_id) return;
    const channel = supabase
      .channel(`cleaning-tasks-${user.company_id}`)
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
    setLoading(true);
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
    } catch (e) {
      toast({ title: "Could not load tasks", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const start = async (t: Schedule) => {
    if (!user?.company_id) return;
    try {
      await supabase.from("cleaning_schedules").update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", t.id).eq("company_id", user.company_id);
      toast({ title: "Task started" });
      load();
    } catch {
      toast({ title: "Could not start", variant: "destructive" });
    }
  };

  const openComplete = (t: Schedule) => { setCompleting(t); setCompletionNotes(""); };
  const closeComplete = () => { setCompleting(null); setCompletionNotes(""); };

  const confirmComplete = async () => {
    if (!completing || !user?.id || !user?.company_id) return;
    setSaving(true);
    try {
      await supabase.from("cleaning_schedules").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        notes: completionNotes.trim() || completing.notes,
        updated_at: new Date().toISOString(),
      }).eq("id", completing.id).eq("company_id", user.company_id);
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

  return (
    <>
      <Head><title>Cleaning tasks - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Task board"
            subtitle={
              <>
                Scheduled checklist work lives here. Equipment returns and washing queues stay on the Cleaning desk.{" "}
                <a href={withSlug("/team-portal/cleaning/schedules")} className="text-brand-primary underline">Open the schedule plan</a> if you need to add a new area checklist.
              </>
            }
            icon={ClipboardCheck}
          />
          <PageWorkbench />

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
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
            {loading ? (
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
            ) : tasks.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <Check className="h-10 w-10 mx-auto mb-3 text-brand-primary dark:text-brand-primary" />
                <p className="font-medium text-slate-900 dark:text-white">No open cleaning tasks</p>
                <p className="text-xs mt-1">Everything is done</p>
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
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {t.status === "in_progress" ? (
                        <Button size="sm" onClick={() => openComplete(t)} className="bg-brand-primary hover:bg-brand-primary/90 text-white">
                          <Check className="h-4 w-4 mr-1" />Done
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => start(t)}>
                            <Play className="h-4 w-4 mr-1" />Start
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openComplete(t)}>
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
        </PortalShell>
      </main>

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
    <ProtectedRoute allowedRoles={[UserRole.CLEANING_MANAGER, UserRole.CLEANING_STAFF, UserRole.ADMIN]}>
      <CleaningTasksPageInner />
    </ProtectedRoute>
  );
}
