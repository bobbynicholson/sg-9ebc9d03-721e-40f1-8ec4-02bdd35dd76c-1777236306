/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: cleaning section - post-event cleaning jobs queued against
 * this order. Tracks the post-event equipment handover state.
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
  actual_end: string | null;
  quantity: number | null;
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
        const { data, error } = await (supabase as any)
          .from("cleaning_jobs")
          .select("id, status, planned_start, planned_end, actual_end, quantity, equipment:equipment_id(name)")
          .eq("order_id", orderId)
          .order("planned_start", { ascending: true, nullsFirst: false });
        if (error) throw error;
        if (!cancelled) setJobs((data || []) as CleaningJob[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadCleaningSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
        <p className="text-sm text-slate-500 py-2">No cleaning jobs queued. They auto-spawn when equipment requiring cleaning is returned post-event.</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => {
            const doneish = j.status === "complete" || j.status === "completed";
            return (
              <li key={j.id} className={`flex items-center gap-2 p-2.5 rounded-md border text-sm ${doneish ? "bg-emerald-50 border-emerald-200" : "bg-cyan-50/60 border-cyan-200"}`}>
                {doneish ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <Clock className="w-4 h-4 text-cyan-600 flex-shrink-0" />}
                <span className="font-medium text-slate-900 truncate">
                  {j.equipment?.name || "Cleaning job"}
                  {j.quantity != null && <span className="text-slate-500 font-normal"> · {j.quantity}</span>}
                </span>
                <span className="ml-auto text-xs text-slate-600 capitalize">{j.status?.replace(/_/g, " ")}</span>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
