/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: waiter section - service-phase progress per assigned waiter.
 * Reads event_attendance rows (one per waiter per order).
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Sparkles, Loader2, CheckCircle2, Clock, Package } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface Attendance {
  id: string;
  waiter_id: string;
  arrived_at: string | null;
  setup_started_at: string | null;
  guests_arrived_at: string | null;
  service_started_at: string | null;
  service_ended_at: string | null;
  event_complete_at: string | null;
  equipment_returned_at: string | null;
  notes: string | null;
  waiter?: { full_name: string | null } | null;
}

const PHASES: Array<{ key: keyof Attendance; label: string }> = [
  { key: "arrived_at", label: "On site" },
  { key: "setup_started_at", label: "Setup started" },
  { key: "guests_arrived_at", label: "Guests arrived" },
  { key: "service_started_at", label: "Service started" },
  { key: "service_ended_at", label: "Service ended" },
  { key: "event_complete_at", label: "Event complete" },
];

export function WaiterSection({ orderId, companyId, defaultOpen, forceOpen, highlight }: Props) {
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("event_attendance")
          .select("id, waiter_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes, waiter:waiter_id(full_name)")
          .eq("order_id", orderId)
          .order("arrived_at", { ascending: true, nullsFirst: true });
        if (error) throw error;
        if (!cancelled) setRows((data || []) as Attendance[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadWaiterSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  // Realtime
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order-doc-waiter:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "event_attendance", filter: `order_id=eq.${orderId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("event_attendance")
            .select("id, waiter_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes, waiter:waiter_id(full_name)")
            .eq("order_id", orderId)
            .order("arrived_at", { ascending: true, nullsFirst: true });
          setRows((data || []) as Attendance[]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const totalStamps = rows.reduce(
    (sum, r) => sum + PHASES.filter((p) => r[p.key]).length,
    0,
  );
  const maxStamps = rows.length * PHASES.length;
  const summary = loading
    ? "Loading..."
    : rows.length === 0
      ? "No waiters checked in"
      : `${rows.length} waiter${rows.length === 1 ? "" : "s"} · ${totalStamps}/${maxStamps} phase taps`;

  return (
    <CollapsibleSection
      id="section-waiter"
      title="Service team"
      summary={summary}
      icon={Sparkles}
      accent="amber"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading service team...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No on-site service phases recorded yet. Waiters tap phase buttons on their portal during the event.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="border-l-2 border-amber-300 pl-3">
              <p className="text-sm font-semibold text-slate-900">{r.waiter?.full_name || "Waiter"}</p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PHASES.map((p) => {
                  const stamped = r[p.key] as string | null;
                  return (
                    <div
                      key={p.key as string}
                      className={`text-xs p-1.5 rounded border flex items-center gap-1.5 ${
                        stamped
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-slate-50 border-slate-200 text-slate-500"
                      }`}
                    >
                      {stamped ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <Clock className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">{p.label}</span>
                      {stamped && (
                        <span className="ml-auto tabular-nums text-[10px]">
                          {new Date(stamped).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {r.equipment_returned_at && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  <Package className="w-3 h-3" />
                  Equipment returned {new Date(r.equipment_returned_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
              {r.notes && (
                <p className="mt-2 text-xs text-slate-700 bg-white border rounded p-2 whitespace-pre-wrap">
                  {r.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}
