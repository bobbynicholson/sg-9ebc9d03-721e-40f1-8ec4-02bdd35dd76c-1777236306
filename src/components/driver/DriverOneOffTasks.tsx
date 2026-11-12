/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock3, Loader2, MapPin, Navigation, Route, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TENANT_TIMEZONE, toZonedISO } from "@/lib/localDate";
import { formatClock } from "@/lib/portalTime";
import type { DailyOperationsDriverTaskStop, DailyOperationsTask } from "@/services/dailyOperationsService";
import { finishDailyOperationTaskPayrollClock, finishDailyOperationTaskRoleClock, startDailyOperationTaskPayrollClock } from "@/services/dailyOperationTaskClock";
import { beginRoleClock, promptForRoleHandoffNote, saveRoleHandoffNote } from "@/services/roleClockService";

type DriverTask = DailyOperationsTask & { driver_stops: DailyOperationsDriverTaskStop[] };
type RouteAction = "start" | "arrive" | "complete_stop" | "back_at_kitchen";

const dayOffset = (value: string, amount: number) => {
  const day = new Date(`${value}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
};

const routeStageLabel = (stage: DailyOperationsTask["route_stage"]) => {
  if (stage === "en_route") return "On the way to a stop";
  if (stage === "at_stop") return "At a stop";
  if (stage === "returning") return "Returning to the kitchen";
  if (stage === "back_at_kitchen") return "Back at the kitchen";
  return "Ready to start";
};

function stopTypeLabel(type: DailyOperationsDriverTaskStop["stop_type"]) {
  if (type === "collection") return "Collect from";
  if (type === "delivery") return "Deliver to";
  return "Stop";
}

function stopStatusLabel(status: DailyOperationsDriverTaskStop["status"]) {
  if (status === "en_route") return "On the way";
  if (status === "arrived") return "Arrived";
  if (status === "completed") return "Done";
  return "Next";
}

export function DriverOneOffTasks() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.company_id || !user?.id) return;
    setLoading(true);
    setLoadError("");
    try {
      const { data: company } = await (supabase as any).from("companies").select("timezone").eq("id", user.company_id).maybeSingle();
      const today = toZonedISO(new Date(), company?.timezone || DEFAULT_TENANT_TIMEZONE);
      const { data, error } = await (supabase as any).from("daily_operations_tasks")
        .select("*")
        .eq("company_id", user.company_id)
        .eq("task_kind", "custom_driver")
        .in("status", ["scheduled", "in_progress"])
        .gte("task_date", dayOffset(today, -14))
        .lte("task_date", dayOffset(today, 14))
        .or(`assigned_to.is.null,assigned_to.eq.${user.id}`)
        .order("task_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(50);
      if (error) throw error;
      const rows = (data || []) as DailyOperationsTask[];
      const ids = rows.map((task) => task.id);
      const stopsByTask = new Map<string, DailyOperationsDriverTaskStop[]>();
      if (ids.length) {
        const { data: stops, error: stopsError } = await (supabase as any).from("daily_operation_driver_task_stops")
          .select("id, company_id, task_id, stop_number, stop_type, stop_name, address, instructions, status, on_way_at, arrived_at, completed_at")
          .eq("company_id", user.company_id)
          .in("task_id", ids)
          .order("stop_number", { ascending: true });
        if (stopsError) throw stopsError;
        for (const stop of (stops || []) as DailyOperationsDriverTaskStop[]) {
          stopsByTask.set(stop.task_id, [...(stopsByTask.get(stop.task_id) || []), stop]);
        }
      }
      setTasks(rows.map((task) => ({ ...task, driver_stops: stopsByTask.get(task.id) || [] })));
    } catch (error: any) {
      setLoadError(error?.message || "Driver routes could not be loaded. Refresh and try again.");
      setTasks([]);
    } finally { setLoading(false); }
  }, [user?.company_id, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const startTimer = async (task: DriverTask) => {
    const clock = await beginRoleClock({ companyId: user.company_id, userId: user.id, role: "driver", dailyOperationTaskId: task.id });
    if (clock.closed.length) {
      const note = await promptForRoleHandoffNote(clock.closed, "driver");
      await saveRoleHandoffNote(clock.closed, note);
    }
    await startDailyOperationTaskPayrollClock({ companyId: user.company_id, userId: user.id, taskId: task.id, taskTitle: task.title });
  };

  const advance = async (task: DriverTask, action: RouteAction) => {
    if (!user?.id || !user?.company_id || workingId) return;
    setWorkingId(task.id);
    let routeAdvanced = false;
    try {
      if (action !== "start") await startTimer(task);
      const { error } = await (supabase as any).rpc("advance_daily_operation_driver_task", {
        p_task_id: task.id,
        p_action: action,
      });
      if (error) throw error;
      routeAdvanced = true;
      if (action === "start") await startTimer(task);
      if (action === "back_at_kitchen") {
        await finishDailyOperationTaskRoleClock({ companyId: user.company_id, userId: user.id, taskId: task.id, role: "driver", note: `Completed driver route: ${task.title}` });
        await finishDailyOperationTaskPayrollClock({ companyId: user.company_id, userId: user.id, taskId: task.id, taskTitle: task.title });
        toast({ title: "Route completed and work time saved", description: `${task.title} · back at the kitchen` });
      } else if (action === "start") {
        toast({ title: "Route started", description: `${task.title} · work time is recording` });
      } else if (action === "arrive") {
        toast({ title: "Arrival recorded", description: task.driver_stops.find((stop) => stop.stop_number === task.route_current_stop_number)?.stop_name || "Current stop" });
      } else {
        toast({ title: "Stop completed", description: "The next stop is now on the way." });
      }
      await load();
    } catch (error: any) {
      toast({
        title: routeAdvanced ? action === "back_at_kitchen" ? "Route completed; timer needs attention" : "Route step saved; timer needs attention" : "Could not update the route",
        description: routeAdvanced ? `${error?.message || "The work timer could not be updated."} ${action === "back_at_kitchen" ? "Ask a manager to review Staff hours." : "Use Continue work timer to retry."}` : error?.message || "The route has not advanced. Refresh and try again.",
        variant: "destructive",
      });
      await load();
    } finally { setWorkingId(null); }
  };

  const resumeTimer = async (task: DriverTask) => {
    if (workingId) return;
    setWorkingId(task.id);
    try {
      await startTimer(task);
      toast({ title: "Route timer is running", description: task.title });
    } catch (error: any) {
      toast({ title: "Could not start the route timer", description: error?.message || "Try again or ask a manager for help.", variant: "destructive" });
    } finally { setWorkingId(null); }
  };

  return <PortalCard id="driver-tasks" className="mb-5 scroll-mt-24 border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-slate-900/70">
    <PortalCardHeader title={<span className="flex items-center gap-2"><Route className="h-4 w-4 text-sky-700 dark:text-sky-300" />One-off driver tasks</span>} />
    <p className="-mt-4 mb-4 text-sm leading-5 text-slate-600 dark:text-slate-400">Claim a route to start recording work time. Mark each stop as you travel, arrive and finish; complete the task when you return to the kitchen.</p>
    {loading && <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading driver routes</div>}
    {!loading && loadError && <div role="alert" className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-white p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-slate-950 dark:text-rose-200"><p>Driver routes could not be loaded. {loadError}</p><Button type="button" variant="outline" onClick={() => void load()} className="h-11 self-start">Reload driver routes</Button></div>}
    {!loading && !loadError && tasks.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">No one-off routes are scheduled. New routes assigned to the driver team will appear here.</p>}
    {!loading && !loadError && tasks.length > 0 && <div className="space-y-3">{tasks.map((task) => {
      const currentStop = task.driver_stops.find((stop) => stop.stop_number === task.route_current_stop_number) || null;
      const nextAction: RouteAction = task.status === "scheduled" ? "start"
        : task.route_stage === "en_route" ? "arrive"
          : task.route_stage === "at_stop" ? "complete_stop" : "back_at_kitchen";
      const actionLabel = nextAction === "start" ? "Start route and timer"
        : nextAction === "arrive" ? `Arrived at ${currentStop?.stop_name || `stop ${task.route_current_stop_number || ""}`}`
          : nextAction === "complete_stop" ? `Complete ${currentStop?.stop_type === "delivery" ? "delivery" : currentStop?.stop_type === "collection" ? "collection" : "stop"}`
            : "Back at kitchen · Complete route";
      const currentAddress = nextAction === "arrive" ? currentStop?.address : task.route_stage === "at_stop" ? currentStop?.address : "";
      const dateLabel = new Date(`${task.task_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
      return <article key={task.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold text-slate-900 dark:text-white">{task.title}</h3><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">{routeStageLabel(task.route_stage)}</span></div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Clock3 className="h-3.5 w-3.5" />{dateLabel} · scheduled {formatClock(task.scheduled_time)}{task.started_at ? ` · started ${new Date(task.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</p>
            {task.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600 dark:text-slate-300">{task.description}</p>}
          </div>
          <div className="grid w-full shrink-0 gap-2 sm:w-auto sm:min-w-[220px]">
            {task.status === "in_progress" && <Button type="button" variant="outline" onClick={() => void resumeTimer(task)} disabled={workingId !== null} className="h-11 w-full"><Clock3 className="mr-2 h-4 w-4" />Continue work timer</Button>}
            <Button type="button" onClick={() => void advance(task, nextAction)} disabled={workingId !== null} className="h-11 w-full bg-brand-primary text-white hover:bg-brand-primary/90">{workingId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : nextAction === "back_at_kitchen" ? <Check className="mr-2 h-4 w-4" /> : <Truck className="mr-2 h-4 w-4" />}{actionLabel}</Button>
            {currentAddress && <Button asChild type="button" variant="outline" className="h-11 w-full"><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentAddress)}`} target="_blank" rel="noreferrer"><Navigation className="mr-2 h-4 w-4" />Directions to {currentStop?.stop_name}<ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>}
          </div>
        </div>
        <ol className="mt-4 space-y-2" aria-label={`${task.title} route stops`}>
          {task.driver_stops.map((stop) => <li key={stop.id} className="flex min-w-0 gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">{stop.stop_number}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stopTypeLabel(stop.stop_type)}</span><span className="break-words text-sm font-medium text-slate-900 dark:text-white">{stop.stop_name}</span><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-950 dark:text-slate-300">{stopStatusLabel(stop.status)}</span></div><p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-slate-400">{stop.address}</p>{stop.instructions && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{stop.instructions}</p>}</div>
          </li>)}
        </ol>
        {task.route_stage === "returning" && <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-100"><MapPin className="h-4 w-4 shrink-0" />All stops are complete. Return to the kitchen to finish the task and timer.</p>}
      </article>;
    })}</div>}
  </PortalCard>;
}
