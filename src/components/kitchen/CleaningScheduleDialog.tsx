/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CleaningScheduleDialog - embedded cleaning-state peek inside the
 * kitchen portal.
 *
 * Bobby's brief: the chef shouldn't have to swap portals (which
 * switches sidebar, branding and the active-role lens) just to
 * answer "is cleaning ready for tomorrow?". This dialog surfaces
 * the same three things the chef cares about from the cleaning
 * dashboard - who's on duty, what's actively being washed, and
 * tomorrow's pre-event checklist - inside the kitchen portal.
 *
 * Read-only by design: the chef sees state without nudging the
 * cleaning team's working surface. A footer link still lets the
 * user open the full cleaning portal when they DO want to manage
 * it (cleaning lead use case).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Users, Droplets, ClipboardCheck, ExternalLink, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { equipmentTrackingService } from "@/services/equipmentTrackingService";
import { listActiveJobs, type CleaningJobWithEquipment } from "@/services/cleaningJobsService";
import { useTenantHref } from "@/lib/tenantUrl";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  /** Tomorrow's roll-up the kitchen page already computes for the
   *  KIT2-O readiness chip. We accept it as a prop instead of
   *  re-fetching so the two surfaces never disagree. */
  cleaningReadiness: { total: number; complete: number } | null;
}

interface ChecklistRow {
  order_id: string;
  status: "ready" | "in_progress" | "pending";
  required_total: number;
  required_done: number;
  /** Embedded from orders for context - event name + client +
   *  event_date. Optional because the join is best-effort. */
  order: {
    event_name: string | null;
    client_name: string | null;
    event_date: string | null;
  } | null;
}

export function CleaningScheduleDialog({
  open,
  onOpenChange,
  companyId,
  cleaningReadiness,
}: Props) {
  const { withSlug } = useTenantHref();
  const [loading, setLoading] = useState(false);
  const [onDuty, setOnDuty] = useState<Array<{ id: string; name: string | null; role: string | null }>>([]);
  const [activeJobs, setActiveJobs] = useState<CleaningJobWithEquipment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Three parallel reads. Each is best-effort - a missing RLS
      // grant or stale row shouldn't blank the whole dialog.
      const [dutyRes, jobsRes, checklistRes] = await Promise.all([
        equipmentTrackingService
          .getOnDutyCleaningStaff(companyId)
          .catch((err) => {
            console.warn("[CleaningScheduleDialog] duty load failed:", err);
            return [] as any[];
          }),
        listActiveJobs(supabase as any, companyId).catch((err) => {
          console.warn("[CleaningScheduleDialog] jobs load failed:", err);
          return [] as CleaningJobWithEquipment[];
        }),
        loadTomorrowChecklist(companyId),
      ]);

      setOnDuty(
        (dutyRes as any[]).map((r) => ({
          id: r.id,
          name: r.profile?.full_name || r.profile?.email || "Cleaner",
          role: r.profile?.role || null,
        })),
      );
      setActiveJobs(jobsRes);
      setChecklist(checklistRes);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-5 h-5 text-brand-primary" />
            Cleaning schedule
            {cleaningReadiness && (
              <Badge
                variant="outline"
                className={`ml-1 tabular-nums ${
                  cleaningReadiness.complete === cleaningReadiness.total
                    ? "bg-brand-primary/15 text-brand-primary border-brand-primary/30"
                    : cleaningReadiness.complete > 0
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                }`}
              >
                Tomorrow {cleaningReadiness.complete}/{cleaningReadiness.total}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Read-only view of what the cleaning team is doing right now and what's queued for tomorrow.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Loading cleaning state...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Who's on duty right now. */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                <Users className="w-4 h-4 text-slate-500" />
                On duty now
                <Badge variant="outline" className="ml-1 tabular-nums">
                  {onDuty.length}
                </Badge>
              </h3>
              {onDuty.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No cleaning staff clocked in.</p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {onDuty.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 p-2 rounded-md border border-slate-200 bg-white"
                    >
                      <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center text-sm font-semibold">
                        {(p.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 truncate capitalize">
                          {(p.role || "cleaning").replace(/_/g, " ")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Live cleaning jobs queue. */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                <Droplets className="w-4 h-4 text-brand-primary" />
                Active cleaning jobs
                <Badge variant="outline" className="ml-1 tabular-nums">
                  {activeJobs.length}
                </Badge>
              </h3>
              {activeJobs.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Nothing in the wash.</p>
              ) : (
                <ul className="space-y-2">
                  {activeJobs.slice(0, 8).map((j) => (
                    <li
                      key={j.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md border border-slate-200 bg-white text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {j.equipment_name || "Equipment"}{" "}
                          <span className="font-normal text-slate-500">x {j.quantity}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {j.status === "in_progress" ? "Washing" : "Queued"}
                          {" - "}
                          {formatEta(j.planned_end)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="capitalize text-xs"
                      >
                        {j.method.replace(/_/g, " ")}
                      </Badge>
                    </li>
                  ))}
                  {activeJobs.length > 8 && (
                    <li className="text-xs text-slate-500 italic">
                      ... and {activeJobs.length - 8} more
                    </li>
                  )}
                </ul>
              )}
            </section>

            {/* Tomorrow's pre-event checklist progress. */}
            <section>
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                <ClipboardCheck className="w-4 h-4 text-brand-primary" />
                Tomorrow's pre-event checklists
                <Badge variant="outline" className="ml-1 tabular-nums">
                  {checklist.length}
                </Badge>
              </h3>
              {checklist.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No checklists for tomorrow's events yet.</p>
              ) : (
                <ul className="space-y-2">
                  {checklist.map((c) => (
                    <li
                      key={c.order_id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md border border-slate-200 bg-white text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {c.order?.event_name || c.order?.client_name || "Event"}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {c.order?.client_name || ""}
                          {c.order?.event_date ? ` - ${c.order.event_date}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`tabular-nums ${
                          c.status === "ready"
                            ? "bg-brand-primary/15 text-brand-primary border-brand-primary/30"
                            : c.status === "in_progress"
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "bg-slate-100 text-slate-700 border-slate-300"
                        }`}
                      >
                        {c.required_done}/{c.required_total}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Escape hatch: cleaning leads who DO want the full
                cleaning portal can click through. The default flow
                no longer assumes the chef wants to swap portals. */}
            <div className="pt-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Need to actually manage cleaning, not just view it?
              </p>
              <Link href={withSlug("/team-portal/cleaning/dashboard")} target="_blank" rel="noopener">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open full cleaning portal
                </Button>
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Pre-event checklist roll-up. Pulled here rather than in
 *  kitchenPrepService because this is the only caller and the
 *  shape is dialog-specific. Filters to tomorrow's date in the
 *  caller's local timezone (matches the readiness chip the
 *  kitchen page already shows). */
async function loadTomorrowChecklist(companyId: string): Promise<ChecklistRow[]> {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Local-tz YYYY-MM-DD to match the orders.event_date type.
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    const isoDate = `${y}-${m}-${d}`;

    const { data: orderRows, error: orderErr } = await (supabase as any)
      .from("orders")
      .select("id, event_name, client_name, event_date")
      .eq("company_id", companyId)
      .eq("event_date", isoDate);
    if (orderErr) {
      console.warn("[CleaningScheduleDialog] orders fetch failed:", orderErr);
      return [];
    }
    const orderById = new Map<string, any>();
    for (const o of (orderRows as any[]) || []) orderById.set(o.id, o);
    if (orderById.size === 0) return [];

    const { data: itemRows } = await (supabase as any)
      .from("cleaning_event_checklists")
      // One row per order; the checklist lives in the `items` jsonb array
      // ({ label, required, checked }). There are no required/done columns.
      .select("order_id, items")
      .eq("company_id", companyId)
      .in("order_id", Array.from(orderById.keys()));

    // Aggregate per order from each row's items array. required items count
    // toward the total; checked ones toward done. Status mirrors the
    // kitchenPrepService convention (ready / in_progress / pending).
    const byOrder = new Map<string, { total: number; done: number }>();
    for (const row of (itemRows as any[]) || []) {
      const items = Array.isArray(row.items) ? row.items : [];
      const cur = byOrder.get(row.order_id) || { total: 0, done: 0 };
      for (const it of items) {
        if (it?.required === false) continue;
        cur.total += 1;
        if (it?.checked) cur.done += 1;
      }
      byOrder.set(row.order_id, cur);
    }

    const out: ChecklistRow[] = [];
    for (const [orderId, order] of orderById) {
      const agg = byOrder.get(orderId) || { total: 0, done: 0 };
      const status: ChecklistRow["status"] = agg.total === 0
        ? "pending"
        : agg.done >= agg.total
          ? "ready"
          : agg.done > 0
            ? "in_progress"
            : "pending";
      out.push({
        order_id: orderId,
        status,
        required_total: agg.total,
        required_done: agg.done,
        order: {
          event_name: order.event_name ?? null,
          client_name: order.client_name ?? null,
          event_date: order.event_date ?? null,
        },
      });
    }
    return out;
  } catch (err) {
    console.warn("[CleaningScheduleDialog] checklist load failed:", err);
    return [];
  }
}

function formatEta(planned: string | null): string {
  if (!planned) return "no ETA";
  const d = new Date(planned);
  if (isNaN(d.getTime())) return "no ETA";
  const diffMin = Math.round((d.getTime() - Date.now()) / 60000);
  if (diffMin <= 0) return "due now";
  if (diffMin < 60) return `back in ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m ? `back in ${h}h ${m}m` : `back in ${h}h`;
}
