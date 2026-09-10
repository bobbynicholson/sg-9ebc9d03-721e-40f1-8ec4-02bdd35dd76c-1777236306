/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: cleaning section - post-event cleaning jobs queued against
 * this order. cleaning_jobs carries triggered_by_event_id (= order id),
 * set by BOTH spawn paths (orderWorkflow delivered-transition +
 * cleaningHandoverService.generateJobsForHandover), so we scope jobs
 * to THIS order directly. The old equipment_bookings bridge matched by
 * equipment_id alone and leaked another order's cleaning jobs whenever
 * two orders booked the same gear (a glass used on 50 orders showed 50
 * unrelated rows). Direct + exact.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Droplets, Loader2, CheckCircle2, Clock } from "lucide-react";
import { OrderContributors } from "../OrderContributors";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface CleaningJob {
  id: string;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  quantity: number | null;
  method: string | null;
  equipment_id: string;
  equipment?: { name: string | null } | null;
}

export function CleaningSection({ orderId, companyId, defaultOpen, forceOpen, highlight }: Props) {
  const [jobs, setJobs] = useState<CleaningJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // cleaning_jobs scoped to THIS order via triggered_by_event_id.
        // No equipment bridge - that leaked other orders' jobs for
        // shared gear. company_id kept as a tenant guard.
        const { data: jobRows, error: jErr } = await (supabase as any)
          .from("cleaning_jobs")
          .select("id, status, planned_start, planned_end, actual_start, actual_end, quantity, method, equipment_id, equipment:equipment_id(name)")
          .eq("company_id", companyId)
          .eq("triggered_by_event_id", orderId)
          .is("deleted_at", null)
          .order("planned_start", { ascending: true, nullsFirst: false });
        if (jErr) throw jErr;
        if (!cancelled) setJobs((jobRows || []) as CleaningJob[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadCleaningSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  // Realtime: cleaning_jobs flip status as cleaners tick rows off.
  useEffect(() => {
    if (!orderId || !companyId) return;
    // Unique per-mount suffix so a quick unmount/remount (tab revisit)
    // doesn't have the old channel's teardown race the new subscribe
    // under a shared name and silently kill the subscription.
    const ch = supabase
      .channel(`order-doc-cleaning:${orderId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "cleaning_jobs", filter: `triggered_by_event_id=eq.${orderId}` },
        async () => {
          const { data: jobRows } = await (supabase as any)
            .from("cleaning_jobs")
            .select("id, status, planned_start, planned_end, actual_start, actual_end, quantity, method, equipment_id, equipment:equipment_id(name)")
            .eq("company_id", companyId)
            .eq("triggered_by_event_id", orderId)
            .is("deleted_at", null)
            .order("planned_start", { ascending: true, nullsFirst: false });
          setJobs((jobRows || []) as CleaningJob[]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, companyId]);

  const done = jobs.filter((j) => j.status === "complete" || j.status === "completed").length;
  const summary = loading
    ? "Loading..."
    : jobs.length === 0
      ? "No cleaning jobs queued"
      : `${done}/${jobs.length} cleaning jobs done`;

  return (
    <CollapsibleSection
      id="section-cleaning"
      title="Cleaning"
      summary={summary}
      icon={Droplets}
      accent="cyan"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      <OrderContributors orderId={orderId} area="cleaning" label="Cleaned by" />
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading cleaning queue...
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No cleaning jobs queued yet. They auto-spawn once equipment requiring cleaning has been booked against this order.</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => {
            const doneish = j.status === "complete" || j.status === "completed";
            return (
              <li key={j.id} className={`flex items-center gap-2 p-2.5 rounded-md border text-sm ${doneish ? "bg-brand-primary/10 border-brand-primary/20" : "bg-brand-primary/10 border-brand-primary/20"}`}>
                {doneish ? <CheckCircle2 className="w-4 h-4 text-brand-primary flex-shrink-0" /> : <Clock className="w-4 h-4 text-brand-primary flex-shrink-0" />}
                <span className="font-medium text-slate-900 truncate flex-1">
                  {j.equipment?.name || "Equipment"}
                  {j.quantity != null && <span className="text-slate-500 font-normal"> · {j.quantity}</span>}
                  {j.method && <span className="text-[10px] uppercase tracking-wider text-slate-500 ml-2">{j.method}</span>}
                </span>
                <span className="text-xs text-slate-600 capitalize flex-shrink-0">{j.status?.replace(/_/g, " ")}</span>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
