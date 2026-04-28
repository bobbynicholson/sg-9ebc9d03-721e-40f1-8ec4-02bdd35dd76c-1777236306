import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardCheck, Loader2, Check, Play, Clock, MapPin } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { CleaningNav } from "@/components/navigation/CleaningNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  pending:     "bg-slate-100 text-slate-700 border-slate-200",
  scheduled:   "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed:   "bg-emerald-100 text-emerald-800 border-emerald-200",
  overdue:     "bg-rose-100 text-rose-700 border-rose-200",
  skipped:     "bg-amber-100 text-amber-800 border-amber-200",
};

export default function CleaningTasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();

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

      if (filter === "today") q = q.eq("scheduled_date", new Date().toISOString().slice(0, 10));
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
    try {
      await supabase.from("cleaning_schedules").update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", t.id);
      toast({ title: "Task started" });
      load();
    } catch {
      toast({ title: "Could not start", variant: "destructive" });
    }
  };

  const openComplete = (t: Schedule) => { setCompleting(t); setCompletionNotes(""); };
  const closeComplete = () => { setCompleting(null); setCompletionNotes(""); };

  const confirmComplete = async () => {
    if (!completing || !user?.id) return;
    setSaving(true);
    try {
      await supabase.from("cleaning_schedules").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        notes: completionNotes.trim() || completing.notes,
        updated_at: new Date().toISOString(),
      }).eq("id", completing.id);
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
      <Head><title>Cleaning Tasks - CateringMS</title></Head>
      <NoIndexMeta />
      <CleaningNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
              <ClipboardCheck className="h-7 w-7 text-cyan-600" />
              Cleaning Tasks
            </h1>
            <p className="text-sm text-slate-600 mt-1">What needs cleaning right now -- start, complete, log notes</p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Open tasks <InfoTooltip content="Cleaning tasks not yet completed in the current filter view. Source: cleaning_schedules where status not equal to 'completed'." /></p><p className="text-2xl font-bold tabular-nums">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Pending <InfoTooltip content="Tasks scheduled but nobody has hit Start. Source: cleaning_schedules.status in ('pending','scheduled')." /></p><p className="text-2xl font-bold tabular-nums text-blue-600">{stats.pending}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">In progress <InfoTooltip content="Tasks someone has started but not yet marked done. Source: cleaning_schedules.status='in_progress'." /></p><p className="text-2xl font-bold tabular-nums text-purple-600">{stats.inProgress}</p></CardContent></Card>
          </div>

          <div className="flex gap-2 mb-4">
            {(["today", "mine", "all"] as const).map((f) => (
              <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className={filter === f ? "bg-cyan-600 hover:bg-cyan-700 capitalize" : "capitalize"}>
                {f === "today" ? "Today" : f === "mine" ? "My tasks" : "All open"}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Check className="h-10 w-10 mx-auto mb-3 text-emerald-300" />
                  <p className="font-medium">No open cleaning tasks</p>
                  <p className="text-xs mt-1">Everything is done</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {tasks.map((t) => (
                    <li key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900">{t.area_name ?? "Cleaning task"}</span>
                          {t.status && (
                            <Badge variant="outline" className={`${statusTone[t.status] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-xs capitalize`}>
                              {t.status.replace("_", " ")}
                            </Badge>
                          )}
                          {t.frequency && (
                            <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-xs capitalize">{t.frequency}</Badge>
                          )}
                        </div>
                        {t.description && <p className="text-xs text-slate-600 mb-1">{t.description}</p>}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {t.scheduled_date && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{t.scheduled_date}</span>}
                          {t.scheduled_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.scheduled_time.slice(0, 5)}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {t.status === "in_progress" ? (
                          <Button size="sm" onClick={() => openComplete(t)} className="bg-emerald-600 hover:bg-emerald-700">
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
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={!!completing} onOpenChange={(o) => !o && closeComplete()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete task</DialogTitle>
            <DialogDescription>{completing?.area_name}{completing?.description ? ` -- ${completing.description}` : ""}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder="Optional notes -- e.g. 'mopped twice, restocked detergent, no issues'"
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeComplete} disabled={saving}>Cancel</Button>
            <Button onClick={confirmComplete} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving</> : "Mark complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
