/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: waiter section - service-phase progress per assigned waiter.
 * Reads event_attendance rows (one per waiter per order).
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types/app";
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
const PHASE_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  PHASES.map((p) => [p.key as string, p.label]),
);

export function WaiterSection({ orderId, companyId, defaultOpen, forceOpen, highlight }: Props) {
  const { user, userRoles } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [stamping, setStamping] = useState<string | null>(null);

  // ODOC Phase 2: only the waiter themselves can stamp their own
  // phases (RLS also enforces this server-side, but we hide the
  // button for everyone else to avoid the dead-tap UX).
  const isWaiter = Array.isArray(userRoles)
    ? userRoles.includes(UserRole.WAITER)
    : user?.role === UserRole.WAITER;

  const stamp = async (attendanceId: string | null, phase: keyof Attendance) => {
    if (!user?.id || !user?.company_id) return;
    setStamping(`${attendanceId || "new"}-${phase as string}`);
    try {
      const nowIso = new Date().toISOString();
      if (attendanceId) {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .update({ [phase]: nowIso })
          .eq("id", attendanceId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .insert({
            company_id: user.company_id,
            order_id: orderId,
            waiter_id: user.id,
            [phase]: nowIso,
          });
        if (error) throw error;
      }
      toast({ title: PHASE_LABEL_BY_KEY[phase as string] || "Stamped", description: "Saved" });
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "stampWaiterPhase", phase: phase as string, orderId, companyId } });
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    } finally {
      setStamping(null);
    }
  };

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
        <div className="space-y-2">
          <p className="text-sm text-slate-500">No on-site service phases recorded yet.</p>
          {isWaiter && (
            <Button
              size="sm"
              onClick={() => stamp(null, "arrived_at")}
              disabled={stamping !== null}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {stamping ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              I'm on site
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const isMine = r.waiter_id === user?.id;
            // Next unstamped phase in the chain
            const nextPhase = PHASES.find((p) => !r[p.key]);
            return (
            <li key={r.id} className="border-l-2 border-amber-300 pl-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-900">
                  {r.waiter?.full_name || "Waiter"}
                  {isMine && <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded px-1 py-0.5">You</span>}
                </p>
                {isMine && isWaiter && nextPhase && (
                  <Button
                    size="sm"
                    onClick={() => stamp(r.id, nextPhase.key)}
                    disabled={stamping !== null}
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                  >
                    {stamping === `${r.id}-${nextPhase.key as string}`
                      ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      : <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {nextPhase.label}
                  </Button>
                )}
              </div>
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
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
