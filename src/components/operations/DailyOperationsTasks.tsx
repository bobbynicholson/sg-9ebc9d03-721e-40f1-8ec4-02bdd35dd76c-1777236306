/* eslint-disable @typescript-eslint/no-explicit-any */
import { formatClock } from "@/lib/portalTime";
import { useEffect, useState } from "react";
import { Check, Clock3, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TENANT_TIMEZONE, toZonedISO } from "@/lib/localDate";
import { cleanDailyOperationsTaskTitle } from "@/lib/dailyOperationsCopy";
import {
  beginRoleClock,
  promptForRoleHandoffNote,
  saveRoleHandoffNote,
  type WorkRole,
} from "@/services/roleClockService";
import { finishDailyOperationTaskPayrollClock, finishDailyOperationTaskRoleClock, startDailyOperationTaskPayrollClock } from "@/services/dailyOperationTaskClock";
import type { DailyOperationsTask } from "@/services/dailyOperationsService";

type Audience = "kitchen" | "cleaning";

const ROLE_BY_AUDIENCE: Record<Audience, WorkRole> = { kitchen: "kitchen", cleaning: "cleaning" };
const TARGETS_BY_AUDIENCE: Record<Audience, string[]> = {
  kitchen: ["kitchen_staff", "kitchen_manager"],
  cleaning: ["cleaning_staff", "cleaning_manager"],
};

const DAILY_TASK_NOTE_SUGGESTIONS = [
  "Completed the task as instructed.",
  "Cleaned and sanitised all assigned areas.",
  "Completed the equipment clean; no issues to report.",
  "Finished the assigned task; no additional work to report.",
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
      const { data: company } = await (supabase as any).from("companies").select("timezone").eq("id", user.company_id).maybeSingle();
      const today = toZonedISO(new Date(), company?.timezone || DEFAULT_TENANT_TIMEZONE);
      const { data, error } = await (supabase as any)
        .from("daily_operations_tasks")
        .select("*")
        .eq("company_id", user.company_id)
        .eq("task_date", today)
        .neq("status", "completed")
        .order("scheduled_time", { ascending: true });
      if (error) throw error;
      const targetRoles = TARGETS_BY_AUDIENCE[audience];
      setTasks(((data || []) as DailyOperationsTask[])
        .filter((task) => (task.visible_roles?.length ? task.visible_roles : task.target_roles).some((role) => targetRoles.includes(role)))
        .map((task) => ({
          ...task,
          title: task.task_kind === "kitchen_cleaning" || task.task_kind === "equipment_cleaning"
            ? cleanDailyOperationsTaskTitle(task.task_kind, task.title)
            : task.title,
        })));
    } catch (error: any) {
      // The feature migration may not have reached a local database yet;
      // don't make the rest of the portal unusable while it is pending.
      console.warn("[DailyOperationsTasks] load failed:", error?.message || error);
      setTasks([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [user?.company_id, audience]);

  const startTaskClocks = async (task: DailyOperationsTask) => {
    const clock = await beginRoleClock({ companyId: user.company_id, userId: user.id, role: ROLE_BY_AUDIENCE[audience], dailyOperationTaskId: task.id });
    if (clock.closed.length) {
      const note = await promptForRoleHandoffNote(clock.closed, ROLE_BY_AUDIENCE[audience]);
      await saveRoleHandoffNote(clock.closed, note);
    }
    await startDailyOperationTaskPayrollClock({ companyId: user.company_id, userId: user.id, taskId: task.id, taskTitle: task.title });
  };

  const resumeTask = async (task: DailyOperationsTask) => {
    if (!user?.id || !user?.company_id || workingId) return;
    setWorkingId(task.id);
    try {
      await startTaskClocks(task);
      toast({ title: "Task timer is running", description: task.title });
      await load();
    } catch (error: any) {
      toast({ title: "Could not start the task timer", description: error?.message || "The task remains assigned to you. Try again or ask a manager for help.", variant: "destructive" });
    } finally { setWorkingId(null); }
  };

  const start = async (task: DailyOperationsTask) => {
    if (!user?.id || !user?.company_id || workingId) return;
    setWorkingId(task.id);
    let taskClaimed = false;
    try {
      const { data: anotherTask, error: activeTaskError } = await (supabase as any).from("daily_operations_tasks")
        .select("id, title")
        .eq("company_id", user.company_id)
        .eq("assigned_to", user.id)
        .eq("status", "in_progress")
        .neq("id", task.id)
        .limit(1)
        .maybeSingle();
      if (activeTaskError) throw activeTaskError;
      if (anotherTask) {
        toast({ title: "Finish your current task first", description: `Complete “${anotherTask.title}” before starting another timed task.`, variant: "destructive" });
        return;
      }
      const { error } = await (supabase as any).rpc("advance_daily_operation_task", {
        p_task_id: task.id,
        p_action: "start",
        p_note: null,
      });
      if (error) throw error;
      taskClaimed = true;
      await startTaskClocks(task);
      toast({ title: "Task started; work time is recording", description: task.title });
      await load();
    } catch (error: any) {
      toast({
        title: taskClaimed ? "Task is assigned, but its timer needs attention" : "Could not start task",
        description: taskClaimed ? error?.message || "Use Continue timer to retry. The task remains assigned to you." : error?.message || "Refresh and try again.",
        variant: "destructive",
      });
      await load();
    } finally { setWorkingId(null); }
  };

  const requestComplete = (task: DailyOperationsTask) => {
    if (workingId) return;
    setCompletionNote("");
    setCompletingTask(task);
  };

  const complete = async () => {
    if (!completingTask || !user?.id || !user?.company_id || workingId) return;
    const note = completionNote.trim() || "Task completed; no additional note supplied.";
    const task = completingTask;
    setWorkingId(task.id);
    let taskCompleted = false;
    try {
      const { error } = await (supabase as any).rpc("advance_daily_operation_task", {
        p_task_id: task.id,
        p_action: "complete",
        p_note: note,
      });
      if (error) throw error;
      taskCompleted = true;
      await finishDailyOperationTaskRoleClock({ companyId: user.company_id, userId: user.id, taskId: task.id, role: ROLE_BY_AUDIENCE[audience], note });
      await finishDailyOperationTaskPayrollClock({ companyId: user.company_id, userId: user.id, taskId: task.id, taskTitle: task.title });
      toast({ title: "Task completed and work time saved", description: task.title });
      setCompletingTask(null);
      await load();
    } catch (error: any) {
      toast({
        title: taskCompleted ? "Task completed; payroll timer needs attention" : "Could not complete task",
        description: taskCompleted ? `${error?.message || "The payable work session could not be closed."} Review this person's session under Staff hours.` : error?.message || "Try again.",
        variant: "destructive",
      });
      if (taskCompleted) { setCompletingTask(null); await load(); }
    } finally { setWorkingId(null); }
  };

  if (loading || tasks.length === 0) return null;
  return (
    <PortalCard className="mb-6 border-brand-primary/25 bg-brand-primary/5 dark:border-brand-primary/30 dark:bg-brand-primary/10">
      <PortalCardHeader title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-primary" />{audience === "kitchen" ? "Daily tasks" : "Cleaning tasks"}</span>} />
      <p className="-mt-4 mb-4 text-sm text-slate-600 dark:text-slate-400">{audience === "kitchen" ? "Work scheduled for the kitchen today." : "Cleaning work scheduled for today."} Start the timer when you begin. Work time is saved through the existing Staff hours flow.</p>
      <div className="space-y-3">
        {tasks.map((task) => {
          const canComplete = task.target_roles.some((role) => TARGETS_BY_AUDIENCE[audience].includes(role))
            && (!task.assigned_to || task.assigned_to === user?.id);
          return (
          <div key={task.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-brand-primary/15 bg-white/70 p-3 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full min-w-0 sm:flex-1"><p className="break-words font-medium text-slate-900 dark:text-white">{task.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3 w-3 shrink-0" />Scheduled {formatClock(task.scheduled_time)} · {task.status.replace("_", " ")}</p>{task.description && <p className="mt-1 break-words text-sm leading-5 text-slate-600 dark:text-slate-400">{task.description}</p>}</div>
            <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:flex sm:w-auto">
              {canComplete ? task.status === "in_progress" ? <>
                <Button size="default" variant="outline" onClick={() => void resumeTask(task)} disabled={workingId !== null} className="h-11 w-full sm:w-auto">{workingId === task.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Clock3 className="mr-1 h-4 w-4" />}Continue timer</Button>
                <Button size="default" onClick={() => requestComplete(task)} disabled={workingId !== null} className="h-11 w-full bg-brand-primary text-white hover:bg-brand-primary/90 sm:w-auto"><Check className="mr-1 h-4 w-4" />Complete task</Button>
              </> : <Button size="default" onClick={() => void start(task)} disabled={workingId !== null} className="h-11 w-full bg-brand-primary text-white hover:bg-brand-primary/90 sm:w-auto">{workingId === task.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}Start task timer</Button> : <span className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{task.assigned_to ? "Assigned to another team member" : "For the other team"}</span>}
            </div>
          </div>
        );
        })}
      </div>
      <Dialog open={!!completingTask} onOpenChange={(open) => { if (!open && !workingId) setCompletingTask(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{audience === "kitchen" ? "Complete kitchen task" : "Complete cleaning task"}</DialogTitle>
            <DialogDescription>Choose a quick note or describe the work you completed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick answers</p><div className="grid gap-2 sm:flex sm:flex-wrap">{DAILY_TASK_NOTE_SUGGESTIONS.map((suggestion) => <Button key={suggestion} type="button" variant="outline" size="default" onClick={() => setCompletionNote(suggestion)} className="h-auto min-h-11 whitespace-normal py-2 text-left text-sm">{suggestion}</Button>)}</div></div>
          <Textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} rows={4} placeholder="Add details about the work completed" autoFocus />
          <DialogFooter><Button variant="outline" onClick={() => setCompletingTask(null)} disabled={!!workingId}>Cancel</Button><Button onClick={() => void complete()} disabled={!!workingId} className="bg-brand-primary text-white hover:bg-brand-primary/90">{workingId ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</> : "Complete task"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalCard>
  );
}
