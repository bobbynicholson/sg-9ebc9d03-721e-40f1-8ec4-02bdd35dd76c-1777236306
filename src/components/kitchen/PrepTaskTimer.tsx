import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Check, X, Timer, AlertTriangle, Mic, MicOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * KIT2-L (kitchen deep audit, KIT2-41): in-memory countdown chip
 * per prep task. When the chef taps Start, we stamp started_at on
 * the row and the chip ticks down from duration_min. Hits zero ->
 * one short chime + a yellow/red dismissible flash so the chef
 * does not miss it while heads-down at the station. Tap Complete
 * to stamp completed_at and drop the row.
 *
 * KIT2-M (KIT2-42): mic button next to the list. Web Speech API
 * recognises "tick / done / complete {task name}", fuzzy-matches
 * the visible labels, fires handleComplete on the best match. Toast
 * "Ticked: {label}" on success; silent on no-match.
 *
 * Why a separate component (not folded into TaskCompletionButtons):
 *   - TaskCompletionButtons writes kitchen_task_completions (the
 *     four macro Food Ready / Cutlery / Crockery / Ready-for-pickup
 *     gates).
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
  companyId?: string | null;
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
  // silent fallback if the audio context cannot be made.
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

// KIT2-M token-overlap match. Splits the spoken phrase and each task
// label into lowercase tokens, scores each task by how many of its
// tokens appear in the phrase. The leading verb (tick / done /
// complete) is stripped so a one-word task name (Lasagne) is not
// shadowed. Threshold of half the label tokens (with substring
// containment as a hard match) keeps "complete" alone from ticking
// a task literally called "complete".
export function fuzzyMatchTask(phrase: string, candidates: PrepTask[]): PrepTask | null {
  const cleaned = phrase
    .toLowerCase()
    .replace(/^(tick|ticked|done|complete|completed|finish|finished)\b/i, "")
    .trim();
  if (!cleaned) return null;
  const phraseTokens = new Set(cleaned.split(/\s+/).filter(Boolean));
  if (phraseTokens.size === 0) return null;

  let best: { task: PrepTask; score: number } | null = null;
  for (const t of candidates) {
    const labelLower = t.menu_item_name.toLowerCase();
    const labelTokens = labelLower.split(/\s+/).filter(Boolean);
    if (labelTokens.length === 0) continue;
    const hits = labelTokens.filter(tok => phraseTokens.has(tok)).length;
    const score = hits / labelTokens.length;
    const subBoost = cleaned.includes(labelLower) ? 1 : 0;
    const finalScore = score + subBoost;
    if (finalScore >= 0.5 && (!best || finalScore > best.score)) {
      best = { task: t, score: finalScore };
    }
  }
  return best?.task ?? null;
}

export function PrepTaskTimer({ orderId, companyId: companyIdProp }: PrepTaskTimerProps) {
  const { user } = useAuth();
  const companyId = companyIdProp || (user as any)?.company_id || null;
  const { toast } = useToast();
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [alerts, setAlerts] = useState<Array<{ id: string; label: string }>>([]);

  const load = useCallback(async () => {
    let query = supabase
      .from("kitchen_prep_tasks")
      .select("id, menu_item_name, task_type, duration_min, status, started_at, completed_at, start_at")
      .eq("order_id", orderId)
      .in("status", ["pending", "in_progress"])
      .is("deleted_at", null);
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query.order("start_at", { ascending: true });
    if (error) {
      console.error("[PrepTaskTimer] kitchen_prep_tasks fetch failed:", error);
      return;
    }
    setTasks((data || []) as PrepTask[]);
  }, [orderId, companyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const realtimeFilter = companyId ? `company_id=eq.${companyId}` : `order_id=eq.${orderId}`;
    const sub = supabase
      .channel(`prep-timer-${orderId}-${Math.random().toString(36).slice(2)}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "kitchen_prep_tasks",
        filter: realtimeFilter,
      }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [orderId, companyId, load]);

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
      setAlerts(prev => prev.filter(a => a.id !== taskId));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Could not complete task", description: msg, variant: "destructive" });
    }
  }, [user?.id, toast, load]);

  // KIT2-M voice tick. Web Speech API is not in lib.dom for every
  // target so we feature-detect via window globals and gate the
  // mic button on it. Eslint-disabled any is the pragmatic shape
  // - the spec types for SpeechRecognition are not first-class.
  const [listening, setListening] = useState(false);
  const [supportsSpeech, setSupportsSpeech] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    setSupportsSpeech(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const stopListening = useCallback(() => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    recogRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const w = window as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      SpeechRecognition?: new () => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webkitSpeechRecognition?: new () => any;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      toast({
        title: "Voice not supported",
        description: "This browser does not expose the Web Speech API. Use Chrome or Edge on the tablet.",
        variant: "destructive",
      });
      return;
    }
    const r = new Ctor();
    r.lang = "en-GB";
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 3;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (ev: any) => {
      const result = ev.results?.[0];
      if (!result) return;
      const alternatives: string[] = [];
      for (let i = 0; i < result.length; i++) {
        const alt = result[i]?.transcript;
        if (alt) alternatives.push(String(alt));
      }
      for (const phrase of alternatives) {
        const match = fuzzyMatchTask(phrase, tasks);
        if (match) {
          void handleComplete(match.id);
          toast({ title: `Ticked: ${match.menu_item_name}` });
          return;
        }
      }
      // No match - intentionally silent.
    };

    r.onerror = () => { stopListening(); };
    r.onend = () => { setListening(false); recogRef.current = null; };

    recogRef.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      stopListening();
    }
  }, [handleComplete, stopListening, tasks, toast]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

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

      {/* KIT2-M: mic chip above the list. Hidden if the browser
          does not expose SpeechRecognition - silent fallback is
          fine because the on-screen taps still work. */}
      {supportsSpeech && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] text-slate-500">
            {listening ? "Listening: say 'done {dish}'..." : "Hands full? Tap mic and say 'done {dish}'"}
          </div>
          <Button
            type="button"
            size="sm"
            variant={listening ? "default" : "outline"}
            className={`min-h-9 min-w-11 px-2 text-xs ${listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : ""}`}
            onClick={listening ? stopListening : startListening}
            aria-label={listening ? "Stop listening" : "Start voice tick"}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
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
