/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Check, Clock3, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForRoleHandoffNote,
  saveRoleHandoffNote,
  type WorkRole,
} from "@/services/roleClockService";
import type { DailyOperationsTask } from "@/services/dailyOperationsService";

type Audience = "kitchen" | "cleaning";

const ROLE_BY_AUDIENCE: Record<Audience, WorkRole> = { kitchen: "kitchen", cleaning: "cleaning" };
const TARGETS_BY_AUDIENCE: Record<Audience, string[]> = {
  kitchen: ["kitchen_staff", "kitchen_manager"],
  cleaning: ["cleaning_staff", "cleaning_manager"],
};

const DAILY_TASK_NOTE_SUGGESTIONS = [
  "Cleaned and sanitised all assigned areas.",
  "Completed the equipment clean; no issues to report.",
  "Finished the daily task; no additional work to report.",
  "Started the clock by mistake; no work completed.",
];

export function DailyOperationsTasks({ audience }: { audience: Audience }) {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [tasks, setTasks] = useState<DailyOperationsTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<DailyOperationsTask | null>(null);
  const [completionNote, setCompletionNote] = useState("");

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("daily_operations_tasks")
        .select("*")
        .eq("company_id", user.company_id)
        .eq("task_date", toLocalISO(new Date()))
        .neq("status", "completed")
        .order("scheduled_time", { ascending: true });
      if (error) throw error;
      const targetRoles = TARGETS_BY_AUDIENCE[audience];
      setTasks(((data || []) as DailyOperationsTask[]).filter((task) => task.target_roles.some((role) => targetRoles.includes(role))));
    } catch (error: any) {
      // The feature migration may not have reached a local database yet;
      // don't make the rest of the portal unusable while it is pending.
      console.warn("[DailyOperationsTasks] load failed:", error?.message || error);
      setTasks([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [user?.company_id, audience]);

  const start = async (task: DailyOperationsTask) => {
    if (!user?.id || !user?.company_id || workingId) return;
    setWorkingId(task.id);
    try {
      const { data, error } = await (supabase as any)
        .from("daily_operations_tasks")
        .update({ status: "in_progress", assigned_to: user.id, started_at: new Date().toISOString() })
        .eq("id", task.id)
        .eq("company_id", user.company_id)
        .eq("status", "scheduled")
        .or(`assigned_to.is.null,assigned_to.eq.${user.id}`)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast({ title: "Task already claimed", description: "Another team member has started this task." });
        await load();
        return;
      }
      const clock = await beginRoleClock({ companyId: user.company_id, userId: user.id, role: ROLE_BY_AUDIENCE[audience] });
      if (clock.closed.length) {
        const note = await promptForRoleHandoffNote(clock.closed, ROLE_BY_AUDIENCE[audience]);
        await saveRoleHandoffNote(clock.closed, note);
      }
      toast({ title: "Daily task started", description: task.title });
      await load();
    } catch (error: any) {
      await (supabase as any).from("daily_operations_tasks").update({ status: "scheduled", assigned_to: null, started_at: null }).eq("id", task.id).eq("assigned_to", user.id);
      toast({ title: "Could not start daily task", description: error?.message || "Try again.", variant: "destructive" });
    } finally { setWorkingId(null); }
  };

  const requestComplete = (task: DailyOperationsTask) => {
    if (workingId) return;
    setCompletionNote("");
    setCompletingTask(task);
  };

  const complete = async () => {
    if (!completingTask || !user?.id || !user?.company_id || workingId) return;
    const note = completionNote.trim() || "Daily operations task completed; no additional note supplied.";
    const task = completingTask;
    setWorkingId(task.id);
    try {
      const { data: updated, error } = await (supabase as any)
        .from("daily_operations_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user.id, notes: note })
        .eq("id", task.id)
        .eq("company_id", user.company_id)
        .eq("status", "in_progress")
        .or(`assigned_to.is.null,assigned_to.eq.${user.id}`)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        toast({ title: "Task is being completed by another team member", description: "This task is assigned to someone else." });
        await load();
        return;
      }
      await endCurrentRoleClock({ companyId: user.company_id, userId: user.id, role: ROLE_BY_AUDIENCE[audience], note, reason: "daily_task_complete" });
      toast({ title: "Daily task completed", description: task.title });
      setCompletingTask(null);
      await load();
    } catch (error: any) {
      toast({ title: "Could not complete daily task", description: error?.message || "Try again.", variant: "destructive" });
    } finally { setWorkingId(null); }
  };

  if (loading || tasks.length === 0) return null;
  return (
    <PortalCard className="mb-6 border-brand-primary/25 bg-brand-primary/5 dark:border-brand-primary/30 dark:bg-brand-primary/10">
      <PortalCardHeader title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-primary" />Daily operations</span>} />
      <p className="-mt-4 mb-4 text-sm text-slate-600 dark:text-slate-400">Scheduled hygiene tasks for today. Starting one also starts your {audience} work clock.</p>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-primary/15 bg-white/70 p-3 dark:bg-slate-900/40">
            <div className="min-w-0"><p className="font-medium text-slate-900 dark:text-white">{task.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3 w-3" />Scheduled {task.scheduled_time.slice(0, 5)} · {task.status.replace("_", " ")}</p>{task.description && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{task.description}</p>}</div>
            <div className="flex gap-2">{task.status === "in_progress" ? <Button size="sm" onClick={() => requestComplete(task)} disabled={workingId !== null} className="bg-brand-primary text-white hover:bg-brand-primary/90"><Check className="mr-1 h-4 w-4" />Done</Button> : <Button size="sm" onClick={() => void start(task)} disabled={workingId !== null} className="bg-brand-primary text-white hover:bg-brand-primary/90">{workingId === task.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}Start</Button>}</div>
          </div>
        ))}
      </div>
      <Dialog open={!!completingTask} onOpenChange={(open) => { if (!open && !workingId) setCompletingTask(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete daily task</DialogTitle>
            <DialogDescription>Tell us what you completed. Choose a quick answer or write your own note, then click Complete task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick answers</p><div className="flex flex-wrap gap-2">{DAILY_TASK_NOTE_SUGGESTIONS.map((suggestion) => <Button key={suggestion} type="button" variant="outline" size="sm" onClick={() => setCompletionNote(suggestion)} className="text-left text-xs">{suggestion}</Button>)}</div></div>
          <Textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} rows={4} placeholder="Add details about the areas or equipment cleaned" autoFocus />
          <DialogFooter><Button variant="outline" onClick={() => setCompletingTask(null)} disabled={!!workingId}>Cancel</Button><Button onClick={() => void complete()} disabled={!!workingId} className="bg-brand-primary text-white hover:bg-brand-primary/90">{workingId ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</> : "Complete task"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalCard>
  );
}
