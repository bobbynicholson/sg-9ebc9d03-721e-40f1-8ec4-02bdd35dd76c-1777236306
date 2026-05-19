import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Check, X, Timer, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * KIT2-L (kitchen deep audit, KIT2-41): in-memory countdown chip
 * per prep task. When the chef taps Start, we stamp started_at on
 * the row and the chip ticks down from duration_min. Hits zero ->
 * one short chime + a yellow/red dismissible flash so the chef
 * doesn't miss it while heads-down at the station. Tap Complete
 * to stamp completed_at and drop the row.
 *
 * Why a separate component (not folded into TaskCompletionButtons):
 *   - TaskCompletionButtons writes kitchen_task_completions (the
 *     four macro "Food Ready / Cutlery / Crockery / Ready for
 *     pickup" gates).
 *   - This writes kitchen_prep_tasks (the per-menu-item prep + cook
 *     rows with duration_min and started_at / completed_at).
 *   Two tables, two responsibilities. The kanban card now mounts
 *   both, auto-expanded so timers are visible without a tap.
 */
interface PrepTask {
  id: string;
  menu_item_name: string;
  task_type: string;
  duration_min: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  start_at: string;
}

interface PrepTaskTimerProps {
  orderId: string;
}

function PrepTaskTimerRow({
  task,
  now,
  onAlert,
  onStart,
  onComplete,
}: {
  task: PrepTask;
  now: number;
  onAlert: (task: PrepTask) => void;
  onStart: (id: string) => Promise<void>;
  onComplete: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const firedRef = useRef(false);

  const startedMs = task.started_at ? new Date(task.started_at).getTime() : null;
  const endMs = startedMs ? startedMs + task.duration_min * 60_000 : null;
  const remainingMs = endMs ? endMs - now : null;
  const remainingMin = remainingMs != null ? Math.ceil(remainingMs / 60_000) : null;
  const overrun = remainingMs != null && remainingMs < 0;

  useEffect(() => {
    if (task.status !== "in_progress") return;
    if (remainingMs == null) return;
    if (remainingMs <= 0 && !firedRef.current) {
      firedRef.current = true;
      onAlert(task);
    }
  }, [remainingMs, task, onAlert]);

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded border border-slate-200 bg-white">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-900 truncate" data-prep-task-label data-task-id={task.id}>
          {task.menu_item_name}
        </div>
        <div className="text-[10px] text-slate-500 capitalize">{task.task_type} - {task.duration_min}m</div>
      </div>

      {task.status === "in_progress" && remainingMin != null && (
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
            overrun
              ? "bg-red-100 text-red-800 border border-red-300"
              : remainingMin <= 5
                ? "bg-amber-100 text-amber-800 border border-amber-300"
                : "bg-blue-100 text-blue-800 border border-blue-300"
          }`}
          title={overrun ? "Overrun" : "Remaining"}
        >
          <Timer className="w-3 h-3" />
          {overrun ? `+${Math.abs(remainingMin)}m` : `${remainingMin}m`}
        </span>
      )}

      {task.status === "pending" && (
        <Button
          size="sm"
          variant="outline"
          className="min-h-9 px-2 text-xs"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await onStart(task.id); } finally { setBusy(false); }
          }}
        >
          <Play className="w-3 h-3 mr-1" />Start
        </Button>
      )}

      {task.status === "in_progress" && (
        <Button
          size="sm"
          className="min-h-9 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await onComplete(task.id); } finally { setBusy(false); }
          }}
        >
          <Check className="w-3 h-3 mr-1" />Done
        </Button>
      )}
    </div>
  );
}

function timerChime() {
  // Same WebAudio approach as NotificationBell - no asset shipped,
  // silent fallback if the audio context can't be made.
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.32);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Best-effort.
  }
}

export function PrepTaskTimer({ orderId }: PrepTaskTimerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [alerts, setAlerts] = useState<Array<{ id: string; label: string }>>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("kitchen_prep_tasks")
      .select("id, menu_item_name, task_type, duration_min, status, started_at, completed_at, start_at")
      .eq("order_id", orderId)
      .in("status", ["pending", "in_progress"])
      .is("deleted_at", null)
      .order("start_at", { ascending: true });
    if (error) {
      console.error("[PrepTaskTimer] kitchen_prep_tasks fetch failed:", error);
      return;
    }
    setTasks((data || []) as PrepTask[]);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // 1s tick so the countdown chips stay live. We render minutes only,
  // but ticking at 1s means the overrun threshold trips within a
  // second of the deadline, not up to a minute later.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime so a sibling tab ticking a task is reflected here. The
  // dashboard already subscribes to kitchen_prep_tasks but it
  // reloads orders, not the per-order task list this component owns.
  useEffect(() => {
    const sub = supabase
      .channel(`prep-timer-${orderId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "kitchen_prep_tasks",
        filter: `order_id=eq.${orderId}`,
      }, () => { void load(); })
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [orderId, load]);

  const handleAlert = useCallback((task: PrepTask) => {
    setAlerts(prev => prev.some(a => a.id === task.id) ? prev : [...prev, { id: task.id, label: `${task.menu_item_name} (${task.task_type})` }]);
    timerChime();
  }, []);

  const handleStart = useCallback(async (taskId: string) => {
    if (!user?.id) {
      toast({ title: "Sign in first", description: "You must be logged in to start tasks.", variant: "destructive" });
      return;
    }
    try {
      await kitchenPrepService.startTask(taskId, user.id);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Could not start task", description: msg, variant: "destructive" });
    }
  }, [user?.id, toast, load]);

  const handleComplete = useCallback(async (taskId: string) => {
    if (!user?.id) {
      toast({ title: "Sign in first", description: "You must be logged in to complete tasks.", variant: "destructive" });
      return;
    }
    try {
      await kitchenPrepService.completeTask(taskId, user.id);
      // Clear any active alert tied to this task - completing it
      // means the chef has acknowledged the timer.
      setAlerts(prev => prev.filter(a => a.id !== taskId));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Could not complete task", description: msg, variant: "destructive" });
    }
  }, [user?.id, toast, load]);

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-1.5" data-prep-task-timer={orderId}>
      {alerts.length > 0 && (
        <div className="space-y-1">
          {alerts.map(a => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 text-[11px] font-semibold text-red-900 bg-red-100 border border-red-300 rounded px-2 py-1 animate-pulse"
              role="alert"
            >
              <span className="inline-flex items-center gap-1 truncate">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Timer up: {a.label}
              </span>
              <button
                type="button"
                onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))}
                className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded hover:bg-red-200"
                aria-label="Dismiss alert"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {tasks.map(t => (
        <PrepTaskTimerRow
          key={t.id}
          task={t}
          now={now}
          onAlert={handleAlert}
          onStart={handleStart}
          onComplete={handleComplete}
        />
      ))}
    </div>
  );
}
