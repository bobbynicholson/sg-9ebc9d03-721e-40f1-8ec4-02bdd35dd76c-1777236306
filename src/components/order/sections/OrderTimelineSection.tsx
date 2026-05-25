/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: full lifecycle timeline. Every recordable step from order
 * confirmed through to equipment collected back at base, rendered
 * as a vertical stepper.
 *
 * Most timestamps live denormalised on orders (filled by RPCs and
 * triggers when each event fires). Three tail timestamps live on
 * event_attendance per waiter - we take the earliest stamp across
 * waiters as the moment that phase started for the order.
 *
 * Service-phase steps (setup -> service -> equipment) are only
 * rendered if the order needs them (requires_waiter / has any
 * event_attendance signal). Cancellation / postponement render as
 * a banner above the main spine, not as inline steps.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import {
  CheckCircle2, Circle, Clock, ChefHat, PackageCheck, Truck, MapPin,
  Sparkles, Users, PartyPopper, ArrowLeftRight, PackageOpen, Flag, Ban, Pause, FileSignature,
} from "lucide-react";

interface OrderForTimeline {
  id: string;
  status: string;
  event_date: string;
  event_time: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  prep_started_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  arrived_at_venue_at: string | null;
  pod_captured_at: string | null;
  delivered_at: string | null;
  setup_started_at: string | null;
  service_started_at: string | null;
  departed_venue_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  postponed_at: string | null;
  requires_waiter: boolean | null;
  waiter_service_required: boolean | null;
  equipment_return_method: string | null;
}

interface Props {
  order: OrderForTimeline;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

// Earliest non-null timestamp across multiple sources.
function earliest(...stamps: (string | null | undefined)[]): string | null {
  const filled = stamps.filter((s): s is string => !!s);
  if (filled.length === 0) return null;
  return filled.sort()[0];
}

function fmtStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function OrderTimelineSection({ order, defaultOpen, forceOpen }: Props) {
  // Service-phase tail timestamps live on event_attendance (one row
  // per waiter). Take the earliest stamp across all waiters for each
  // phase to represent when the order moved through that step.
  const [serviceEnded, setServiceEnded] = useState<string | null>(null);
  const [eventComplete, setEventComplete] = useState<string | null>(null);
  const [equipmentReturned, setEquipmentReturned] = useState<string | null>(null);
  const [hasAttendance, setHasAttendance] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("event_attendance")
          .select("setup_started_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at")
          .eq("order_id", order.id);
        if (cancelled) return;
        const rows = (data || []) as any[];
        setHasAttendance(rows.length > 0);
        setServiceEnded(earliest(...rows.map((r) => r.service_ended_at)));
        setEventComplete(earliest(...rows.map((r) => r.event_complete_at)));
        setEquipmentReturned(earliest(...rows.map((r) => r.equipment_returned_at)));
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadTimelineAttendance", orderId: order.id } });
      }
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  // Realtime: re-pull attendance phase stamps when waiters tap their
  // chips. Cheap enough - 5 timestamps per waiter row.
  useEffect(() => {
    if (!order.id) return;
    const ch = supabase
      .channel(`order-timeline-attend:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "event_attendance", filter: `order_id=eq.${order.id}` },
        async () => {
          const { data } = await (supabase as any)
            .from("event_attendance")
            .select("setup_started_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at")
            .eq("order_id", order.id);
          const rows = (data || []) as any[];
          setHasAttendance(rows.length > 0);
          setServiceEnded(earliest(...rows.map((r) => r.service_ended_at)));
          setEventComplete(earliest(...rows.map((r) => r.event_complete_at)));
          setEquipmentReturned(earliest(...rows.map((r) => r.equipment_returned_at)));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [order.id]);

  const cancelled = !!order.cancelled_at;
  const postponed = !!order.postponed_at;
  // Service-phase steps are relevant if the order needs waiters or
  // any waiter has actually checked in. Otherwise they're noise.
  const needsService = !!(order.requires_waiter || order.waiter_service_required || hasAttendance);
  // Equipment-return step shows if there's any equipment-return
  // signal (a method on the order, an attendance stamp, or the
  // departed_venue_at field). For most catering jobs there's
  // something to bring back, so this is conservative.
  const hasEquipmentSignal = !!(
    equipmentReturned ||
    (order.equipment_return_method && order.equipment_return_method !== "none" && order.equipment_return_method !== "client_keeps")
  );

  type Step = {
    key: string;
    label: string;
    Icon: any;
    at: string | null;
    /** Hide entirely when false (vs render as pending) */
    show?: boolean;
    /** Lane: kitchen / driver / service / closeout - drives the accent dot colour */
    lane: "open" | "kitchen" | "driver" | "service" | "closeout";
  };

  const allSteps: Step[] = ([
    { key: "created",       label: "Order created",        Icon: Flag,           at: order.created_at,          lane: "open" },
    { key: "confirmed",     label: "Confirmed",            Icon: CheckCircle2,   at: order.confirmed_at,        lane: "open" },
    { key: "prep",          label: "Prep started",         Icon: ChefHat,        at: order.prep_started_at,     lane: "kitchen" },
    { key: "ready",         label: "Ready for collection", Icon: PackageCheck,   at: order.ready_at,            lane: "kitchen" },
    { key: "picked_up",     label: "Collected by driver",  Icon: Truck,          at: order.picked_up_at,        lane: "driver" },
    { key: "arrived",       label: "Arrived at venue",     Icon: MapPin,         at: order.arrived_at_venue_at, lane: "driver" },
    { key: "pod",           label: "POD captured",         Icon: FileSignature,  at: order.pod_captured_at,     lane: "driver" },
    { key: "delivered",     label: "Delivered",            Icon: PackageOpen,    at: order.delivered_at,        lane: "driver" },
    { key: "setup",         label: "Setup started",        Icon: Sparkles,       at: order.setup_started_at,    show: needsService, lane: "service" },
    { key: "service_start", label: "Service started",     Icon: Users,          at: order.service_started_at,  show: needsService, lane: "service" },
    { key: "service_end",   label: "Service ended",        Icon: Clock,          at: serviceEnded,              show: needsService, lane: "service" },
    { key: "event_done",    label: "Event complete",       Icon: PartyPopper,    at: eventComplete,             show: needsService, lane: "service" },
    { key: "departed",      label: "Departed venue",       Icon: ArrowLeftRight, at: order.departed_venue_at,   lane: "closeout" },
    { key: "equipment",     label: "Equipment collected",  Icon: PackageCheck,   at: equipmentReturned,         show: hasEquipmentSignal, lane: "closeout" },
    { key: "completed",     label: "Closed",               Icon: CheckCircle2,   at: order.completed_at,        lane: "closeout" },
  ] as Step[]);
  const steps: Step[] = allSteps.filter((s) => s.show !== false);

  // Pick the current step: the last one with a timestamp (or first
  // pending if none stamped yet). Used for the summary line.
  const lastDoneIdx = (() => {
    let idx = -1;
    steps.forEach((s, i) => { if (s.at) idx = i; });
    return idx;
  })();
  const currentLabel = cancelled
    ? "Cancelled"
    : postponed
      ? "Postponed"
      : lastDoneIdx >= 0
        ? steps[lastDoneIdx].label
        : "Awaiting confirmation";

  // Lane accent palette - matches each section's colour so the
  // viewer sees at a glance which team owns which step.
  const laneClass = (lane: Step["lane"], reached: boolean) => {
    if (!reached) return "bg-slate-100 text-slate-400 border-slate-200";
    switch (lane) {
      case "kitchen":  return "bg-rose-500 text-white border-rose-600";
      case "driver":   return "bg-indigo-500 text-white border-indigo-600";
      case "service":  return "bg-amber-500 text-white border-amber-600";
      case "closeout": return "bg-emerald-500 text-white border-emerald-600";
      default:         return "bg-slate-500 text-white border-slate-600";
    }
  };

  return (
    <CollapsibleSection
      id="section-timeline"
      title="Status timeline"
      summary={`Currently: ${currentLabel}`}
      icon={Clock}
      accent="blue"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      <div className="space-y-3">
        {/* Cancellation / postponement banner - takes precedence over
            the main spine because it changes how the rest reads. */}
        {cancelled && (
          <div className="flex items-start gap-2 p-2.5 rounded border border-rose-200 bg-rose-50">
            <Ban className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-rose-900">Order cancelled</p>
              <p className="text-rose-700 mt-0.5">{fmtStamp(order.cancelled_at)}</p>
            </div>
          </div>
        )}
        {postponed && !cancelled && (
          <div className="flex items-start gap-2 p-2.5 rounded border border-amber-200 bg-amber-50">
            <Pause className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-amber-900">Order postponed</p>
              <p className="text-amber-700 mt-0.5">{fmtStamp(order.postponed_at)}</p>
            </div>
          </div>
        )}

        {/* Vertical stepper. Each row is icon-dot + connector line +
            label + timestamp. Dots colour-match the responsible team. */}
        <ol className="relative">
          {steps.map((step, i) => {
            const reached = !!step.at;
            const isCurrent = i === lastDoneIdx;
            const Icon = step.Icon;
            const isLast = i === steps.length - 1;
            return (
              <li key={step.key} className="relative flex items-start gap-3 pb-3 last:pb-0">
                {/* Connector line drops from this dot to the next.
                    The line itself uses a slate background and the
                    "reached" half is a gradient overlay to keep it
                    legible without per-row state.   */}
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[15px] top-7 bottom-0 w-px ${reached ? "bg-emerald-400" : "bg-slate-200"}`}
                  />
                )}
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 transition ${laneClass(step.lane, reached)} ${isCurrent ? "ring-2 ring-offset-2 ring-blue-300" : ""}`}
                >
                  {reached ? <Icon className="w-4 h-4" /> : <Circle className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <p className={`text-sm ${reached ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                      {step.label}
                      {isCurrent && !cancelled && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">Now</span>
                      )}
                    </p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {reached ? fmtStamp(step.at) : "—"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Lane legend - small helper so the dot colours mean
            something at a glance. Hidden when there's nothing
            interesting to disambiguate. */}
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500 pt-2 border-t border-slate-100 flex-wrap">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" />Open</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Kitchen</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" />Driver</span>
          {needsService && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Service</span>}
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Closeout</span>
        </div>
      </div>
    </CollapsibleSection>
  );
}
