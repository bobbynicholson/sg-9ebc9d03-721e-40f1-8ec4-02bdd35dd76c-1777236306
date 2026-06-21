/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Interactive prep-task list for the kitchen ticket (the page chefs
 * actually work from). The ticket itself is a read-only prep sheet, so
 * before this the chef had to bounce to the order doc to Start/Done
 * tasks. This card brings the same Start/Done actions onto the ticket:
 *   - lists this order's kitchen_prep_tasks
 *   - Start (-> stamps order.prep_started_at + pings nobody extra) and
 *     Done (-> when all done, order auto-flips ready + notifies dispatch)
 *     via the shared kitchenPrepService so every side effect fires
 *   - shows "Done by {name} · {time}" for accountability
 *   - live-refreshes via realtime so two devices stay in sync
 * Screen-only (no-print) so it never shows on the printed sheet.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Play, Loader2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { kitchenPrepService } from "@/services/kitchenPrepService";

interface PrepTaskRow {
  id: string;
  task_type: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  menu_item_name: string | null;
  start_at: string | null;
  duration_min: number | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function KitchenPrepTasksCard({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<PrepTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!orderId) return;
    const { data } = await (supabase as any)
      .from("kitchen_prep_tasks")
      .select("id, task_type, status, started_at, completed_at, completed_by, menu_item_name, start_at, duration_min")
      .eq("order_id", orderId)
      .is("deleted_at", null)
      .order("start_at", { ascending: true, nullsFirst: false });
    const rows = (data || []) as PrepTaskRow[];
    setTasks(rows);
    const ids = Array.from(new Set(rows.map((r) => r.completed_by).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: profs } = await (supabase as any).from("profiles").select("id, full_name").in("id", ids);
      const m = new Map<string, string>();
      for (const p of (profs || []) as any[]) if (p.full_name) m.set(p.id, p.full_name);
      setNames(m);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`kitchen-ticket-tasks:${orderId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "kitchen_prep_tasks", filter: `order_id=eq.${orderId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [orderId, load]);

  const onStart = async (id: string) => {
    if (!user?.id) return;
    setActing(id);
    try {
      await kitchenPrepService.startTask(id, user.id);
      toast({ title: "Started", description: "Task in progress." });
    } catch (e: any) {
      toast({ title: "Could not start", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const onDone = async (id: string) => {
    if (!user?.id) return;
    setActing(id);
    try {
      await kitchenPrepService.completeTask(id, user.id);
      toast({ title: "Done", description: "Task marked complete." });
    } catch (e: any) {
      toast({ title: "Could not complete", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  if (loading || tasks.length === 0) return null;
  const doneCount = tasks.filter((t) => t.status === "done" || t.status === "completed").length;
  const allDone = doneCount === tasks.length;

  return (
    <div className="no-print rounded-xl border border-orange-200 bg-orange-50/60 p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-800">Prep tasks - tick as you go</h3>
        <span className="text-xs font-semibold text-orange-700 tabular-nums">{doneCount}/{tasks.length} done</span>
      </div>
      <ul className="space-y-1.5">
        {tasks.map((t) => {
          const doneish = t.status === "done" || t.status === "completed";
          const inProgress = t.status === "in_progress";
          const isActing = acting === t.id;
          return (
            <li key={t.id} className="flex items-center gap-3 p-2.5 rounded-md border border-slate-200 bg-white">
              {doneish ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  <span className="capitalize">{t.task_type}</span>
                  {t.menu_item_name && <span className="text-slate-500"> · {t.menu_item_name}</span>}
                </p>
                {doneish && t.completed_at && (
                  <p className="text-[11px] text-emerald-700">
                    Done{t.completed_by && names.get(t.completed_by) ? ` by ${names.get(t.completed_by)}` : ""} · {fmt(t.completed_at)}
                  </p>
                )}
                {inProgress && t.started_at && (
                  <p className="text-[11px] text-orange-700">Started · {fmt(t.started_at)}</p>
                )}
              </div>
              {!doneish ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!inProgress && (
                    <Button size="sm" variant="outline" onClick={() => onStart(t.id)} disabled={isActing} className="h-8 text-xs">
                      {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Play className="w-3 h-3 mr-1" />Start</>}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => onDone(t.id)} disabled={isActing} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                    {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" />Done</>}
                  </Button>
                </div>
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 flex-shrink-0">{t.status}</span>
              )}
            </li>
          );
        })}
      </ul>
      {allDone && (
        <p className="mt-2 text-xs font-semibold text-emerald-700">
          All prep done - the order has been moved to Ready and dispatch notified.
        </p>
      )}
    </div>
  );
}
