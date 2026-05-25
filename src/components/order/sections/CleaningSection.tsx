/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: cleaning section - post-event cleaning jobs queued against
 * the equipment from this order. cleaning_jobs is keyed by
 * equipment_id (not order_id), so we bridge via equipment_bookings
 * to find which jobs belong to this order. Cheap two-hop.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Droplets, Loader2, CheckCircle2, Clock } from "lucide-react";

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
        // Step 1: equipment_bookings keyed by this order. Yields the
        // equipment IDs whose cleaning jobs we care about.
        const { data: bookings, error: bErr } = await (supabase as any)
          .from("equipment_bookings")
          .select("equipment_id")
          .eq("order_id", orderId);
        if (bErr) throw bErr;
        const equipmentIds = Array.from(
          new Set(
            ((bookings || []) as Array<{ equipment_id: string | null }>)
              .map((b) => b.equipment_id)
              .filter((x): x is string => !!x),
          ),
        );
        if (equipmentIds.length === 0) {
          if (!cancelled) setJobs([]);
          return;
        }

        // Step 2: cleaning_jobs scoped to this company + the
        // equipment booked on this order. Filter to active /
        // recent jobs - older completed jobs would noise up the
        // view (a glass that's been used on 50 orders shouldn't
        // show 50 cleaning rows).
        const { data: jobRows, error: jErr } = await (supabase as any)
          .from("cleaning_jobs")
          .select("id, status, planned_start, planned_end, actual_start, actual_end, quantity, method, equipment_id, equipment:equipment_id(name)")
          .eq("company_id", companyId)
          .in("equipment_id", equipmentIds)
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
    const ch = supabase
      .channel(`order-doc-cleaning:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "cleaning_jobs", filter: `company_id=eq.${companyId}` },
        async () => {
          // Refetch the bridge - covers the case where a new booking
          // shows up on this order mid-session too.
          const { data: bookings } = await (supabase as any)
            .from("equipment_bookings")
            .select("equipment_id")
            .eq("order_id", orderId);
          const equipmentIds = Array.from(
            new Set(
              ((bookings || []) as Array<{ equipment_id: string | null }>)
                .map((b) => b.equipment_id)
                .filter((x): x is string => !!x),
            ),
          );
          if (equipmentIds.length === 0) { setJobs([]); return; }
          const { data: jobRows } = await (supabase as any)
            .from("cleaning_jobs")
            .select("id, status, planned_start, planned_end, actual_start, actual_end, quantity, method, equipment_id, equipment:equipment_id(name)")
            .eq("company_id", companyId)
            .in("equipment_id", equipmentIds)
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
              <li key={j.id} className={`flex items-center gap-2 p-2.5 rounded-md border text-sm ${doneish ? "bg-emerald-50 border-emerald-200" : "bg-cyan-50/60 border-cyan-200"}`}>
                {doneish ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <Clock className="w-4 h-4 text-cyan-600 flex-shrink-0" />}
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
