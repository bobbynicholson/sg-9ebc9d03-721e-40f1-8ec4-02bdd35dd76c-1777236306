/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: kitchen section - prep tasks, collection time, prep timeline.
 *
 * Phase 1: read-only summary. Lists every kitchen_prep_task for the
 * order with start/end times + completion state. Phase 2 will add
 * inline "mark done" buttons.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { ChefHat, Loader2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  collectionTime: string | null;
  eventDate: string;
  eventTime: string | null;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface PrepTask {
  id: string;
  task_type: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  station_id: string | null;
  duration_minutes: number | null;
  notes: string | null;
  station?: { name: string | null } | null;
  menu_item?: { name: string | null } | null;
}

const TASK_STATUS_TONES: Record<string, string> = {
  pending: "bg-slate-50 text-slate-700 border-slate-200",
  in_progress: "bg-orange-50 text-orange-700 border-orange-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  skipped: "bg-slate-50 text-slate-500 border-slate-200",
};

export function KitchenSection({
  orderId, companyId, collectionTime, eventDate, eventTime,
  defaultOpen, forceOpen, highlight,
}: Props) {
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("kitchen_prep_tasks")
          .select("id, task_type, status, start_at, end_at, station_id, duration_minutes, notes, station:station_id(name), menu_item:menu_item_id(name)")
          .eq("order_id", orderId)
          .order("start_at", { ascending: true, nullsFirst: false });
        if (error) throw error;
        if (!cancelled) setTasks((data || []) as PrepTask[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadKitchenSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  // Realtime - keep this section fresh as kitchen marks tasks done
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order-doc-kitchen:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "kitchen_prep_tasks", filter: `order_id=eq.${orderId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("kitchen_prep_tasks")
            .select("id, task_type, status, start_at, end_at, station_id, duration_minutes, notes, station:station_id(name), menu_item:menu_item_id(name)")
            .eq("order_id", orderId)
            .order("start_at", { ascending: true, nullsFirst: false });
          setTasks((data || []) as PrepTask[]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const done = tasks.filter((t) => t.status === "done" || t.status === "completed").length;
  const summary = loading
    ? "Loading..."
    : tasks.length === 0
      ? "No prep tasks queued"
      : `${done}/${tasks.length} prep tasks done`;

  // Collection time intel - the kitchen's single most important number
  const collectionDisplay = collectionTime || eventTime;
  const collectionLabel = collectionDisplay
    ? `${collectionDisplay.slice(0, 5)} on ${new Date(eventDate).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
    : null;

  return (
    <CollapsibleSection
      id="section-kitchen"
      title="Kitchen"
      summary={summary}
      icon={ChefHat}
      accent="orange"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      {collectionLabel && (
        <div className="flex items-start gap-2 mb-4 p-3 rounded-md bg-orange-50/80 border border-orange-200">
          <Clock className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs uppercase tracking-wider text-orange-800 font-semibold">Collection / service time</p>
            <p className="text-sm font-semibold text-orange-900">{collectionLabel}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading prep tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">No prep tasks yet</p>
            <p className="text-xs text-amber-800 mt-0.5">Prep tasks auto-cascade once the order is confirmed. If they're still missing, kitchen settings may need attention.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const tone = TASK_STATUS_TONES[t.status?.toLowerCase()] || TASK_STATUS_TONES.pending;
            const doneish = t.status === "done" || t.status === "completed";
            return (
              <li key={t.id} className={`flex items-center gap-3 p-2.5 rounded-md border ${tone}`}>
                {doneish ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    <span className="capitalize">{t.task_type}</span>
                    {t.menu_item?.name && <span className="text-slate-500"> · {t.menu_item.name}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.station?.name && <span>{t.station.name}</span>}
                    {t.start_at && (
                      <span>{t.station?.name ? " · " : ""}{new Date(t.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    {t.duration_minutes && <span> · {t.duration_minutes}min</span>}
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-slate-600">{t.status}</span>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
