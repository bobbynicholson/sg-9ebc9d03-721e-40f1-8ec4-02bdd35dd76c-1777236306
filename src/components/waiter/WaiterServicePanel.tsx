/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WTR-A: Waiter / on-site server service panel.
 *
 * Renders on /team-portal/waiter/dashboard, and also inside the
 * driver dashboard for users who hold both roles. Shows the user's
 * assigned events for today + a 4-phase service tracker per event:
 *
 *   setup_started -> guests_arrived -> service_started -> service_ended
 *
 * Each phase is a single tap and stamps a timestamp on event_attendance.
 * An "I'm here" arrival button precedes the phases; a "Service complete"
 * button at the end (after service_ended) closes the row with
 * event_complete_at.
 *
 * Equipment-back-to-kitchen helper at the bottom of each card lets
 * the waiter signal "I'm bringing these back today" vs "next day"
 * so cleaning knows when to expect items.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ChefHat, Users, MapPin, Clock, CheckCircle2, Sparkles, Truck,
  Loader2, PartyPopper, Package, MessageSquareText, Calendar as CalendarIcon,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useTenantHref } from "@/lib/tenantUrl";
import { toLocalISO } from "@/lib/localDate";
import { staffOrderHref } from "@/lib/orderUrls";
import { orderDisplayName } from "@/lib/orderDisplayName";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForRoleHandoffNote,
  promptForWorkNote,
  saveRoleHandoffNote,
} from "@/services/roleClockService";

const ROUTE = "/team-portal/waiter/dashboard";

type Phase =
  | "arrived_at"
  | "setup_started_at"
  | "guests_arrived_at"
  | "service_started_at"
  | "service_ended_at"
  | "event_complete_at"
  | "equipment_returned_at";

interface AssignedOrder {
  id: string;
  order_number: string | null;
  event_name: string | null;
  event_date: string;
  event_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  guest_count: number | null;
  client_name: string | null;
  status: string;
}

interface Attendance {
  id: string;
  order_id: string;
  arrived_at: string | null;
  setup_started_at: string | null;
  guests_arrived_at: string | null;
  service_started_at: string | null;
  service_ended_at: string | null;
  event_complete_at: string | null;
  equipment_returned_at: string | null;
  work_started_at?: string | null;
  work_ended_at?: string | null;
  notes: string | null;
}

export function WaiterServicePanel() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [loading, setLoading] = useState(true);
  // Command-centre standard: a failed load must never render as the
  // "No events to staff" empty state - that reads as a day off when
  // the waiter may actually have three events.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingPhase, setSavingPhase] = useState<{ orderId: string; phase: Phase } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.company_id || !user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const today = toLocalISO(new Date());
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 2);
      const horizonIso = toLocalISO(horizon);
      const { data: attRows, error: attErr } = await (supabase as any)
        .from("event_attendance")
        .select("id, order_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes")
        .eq("company_id", user.company_id)
        .eq("waiter_id", user.id);
      if (attErr) throw attErr;

      const attendanceByOrder: Record<string, Attendance> = {};
      const attendanceOrderIds = new Set<string>();
      (attRows || []).forEach((a: any) => {
        attendanceByOrder[a.order_id] = a as Attendance;
        attendanceOrderIds.add(a.order_id);
      });

      const orderMap = new Map<string, AssignedOrder>();
      if (attendanceOrderIds.size > 0) {
        const { data: assignedOrders, error: assignedErr } = await (supabase as any)
          .from("orders")
          .select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, client_name, status")
          .eq("company_id", user.company_id)
          .in("id", Array.from(attendanceOrderIds))
          .gte("event_date", today)
          .lte("event_date", horizonIso)
          .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"])
          .order("event_date", { ascending: true });
        if (assignedErr) throw assignedErr;
        (assignedOrders || []).forEach((order: any) => orderMap.set(order.id, order as AssignedOrder));
      }

      // Compatibility: older waiter jobs were implied by a driver
      // assignment plus requires_waiter before event_attendance became
      // the canonical assignment table.
      const { data: legacyDriverServiceOrders } = await (supabase as any)
        .from("orders")
        .select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, client_name, status")
        .eq("company_id", user.company_id)
        .eq("assigned_driver_id", user.id)
        .gte("event_date", today)
        .lte("event_date", horizonIso)
        .or("requires_waiter.eq.true,waiter_service_required.eq.true")
        .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"])
        .order("event_date", { ascending: true });
      (legacyDriverServiceOrders || []).forEach((order: any) => {
        if (!orderMap.has(order.id)) orderMap.set(order.id, order as AssignedOrder);
      });

      const nextOrders = Array.from(orderMap.values()).sort((a, b) =>
        `${a.event_date} ${a.event_time || ""}`.localeCompare(`${b.event_date} ${b.event_time || ""}`),
      );
      const visibleIds = new Set(nextOrders.map((o) => o.id));
      const visibleAttendance: Record<string, Attendance> = {};
      for (const [orderId, row] of Object.entries(attendanceByOrder)) {
        if (visibleIds.has(orderId)) visibleAttendance[orderId] = row;
      }
      setOrders(nextOrders);
      setAttendance(visibleAttendance);
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "loadWaiterAssignments", companyId: user.company_id } });
      setLoadError(e?.message || "We couldn't load your service queue.");
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, user?.id]);

  useEffect(() => { load(); }, [load]);

  // WTR-A: realtime sub on event_attendance so a stamp from another
  // device (admin override / shared tablet) updates this UI live.
  useEffect(() => {
    if (!user?.company_id || !user?.id) return;
    const channel = supabase
      .channel(`waiter-attendance:${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "event_attendance", filter: `waiter_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.company_id, user?.id, load]);

  const stampPhase = async (orderId: string, phase: Phase) => {
    if (!user?.id || !user?.company_id) return;
    setSavingPhase({ orderId, phase });
    try {
      const existing = attendance[orderId];
      const nowIso = new Date().toISOString();
      // A waiter may open an event after arrival was already stamped by an
      // admin/shared tablet. Claim the role on every service phase so the
      // same person's driver/kitchen/cleaning clock is still closed at the
      // real first waiter action, not only when they tap "On site".
      if (phase !== "equipment_returned_at") {
        const roleClock = await beginRoleClock({ companyId: user.company_id, userId: user.id, role: "waiter", orderId, startedAt: nowIso });
        if (roleClock.closed.length > 0) {
          await saveRoleHandoffNote(roleClock.closed, await promptForRoleHandoffNote(roleClock.closed, "waiter"));
        }
      }
      const phasePayload = {
        [phase]: nowIso,
        ...(!existing?.work_started_at && phase !== "equipment_returned_at" ? { work_started_at: nowIso } : {}),
        ...(["service_ended_at", "event_complete_at"].includes(phase)
          ? { work_ended_at: nowIso, work_end_reason: "manual", work_end_note: "Service completed; no additional note supplied." }
          : {}),
      };
      if (existing) {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .update(phasePayload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .insert({
            company_id: user.company_id,
            order_id: orderId,
            waiter_id: user.id,
            ...phasePayload,
          });
        if (error) throw error;
      }
      if (phase === "event_complete_at") {
        const note = await promptForWorkNote("What did you complete during this waiter service?", "Waiter service completed; no additional note supplied.");
        try {
          await endCurrentRoleClock({ companyId: user.company_id, userId: user.id, role: "waiter", endedAt: nowIso, note });
          await (supabase as any).from("event_attendance")
            .update({ work_end_note: note })
            .eq("company_id", user.company_id).eq("order_id", orderId).eq("waiter_id", user.id);
        } catch (roleErr) {
          console.warn("[WaiterServicePanel] role clock-out note failed:", roleErr);
        }
      }
      toast({ title: PHASE_LABELS[phase], description: "Stamped now" });

      // Communication: the office was previously never told when a waiter
      // ran an event - tapping "Event complete" pinged nobody and (unlike
      // the driver flow) doesn't flip the order status. Broadcast the
      // milestone phases to admins/owner so they know service is
      // progressing / done. Best-effort + dedup; never fails the stamp.
      const MILESTONE_PHASES: Phase[] = [
        "arrived_at", "service_started_at", "event_complete_at", "equipment_returned_at",
      ];
      if (MILESTONE_PHASES.includes(phase)) {
        try {
          const ord = orders.find((o) => o.id === orderId);
          const label = ord ? orderDisplayName(ord as any) : "an event";
          const who = (user as any)?.full_name || (user as any)?.email || "A waiter";
          const { notificationService } = await import("@/services/notificationService");
          const { UserRole } = await import("@/types/app");
          await notificationService.broadcastNotification({
            companyId: user.company_id,
            type: "waiter_service_update",
            title: `${PHASE_LABELS[phase]} - ${label}`,
            message: `${who} marked "${PHASE_LABELS[phase]}" for ${label}.`,
            targetRoles: [UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN],
            priority: phase === "event_complete_at" ? "high" : "normal",
            relatedEntityType: "order",
            relatedEntityId: orderId,
            dedup: true,
            dedupWindowMinutes: 10,
          } as any, supabase);
        } catch (notifyErr) {
          console.warn("[WaiterServicePanel] milestone notify failed:", notifyErr);
        }
      }

      load();
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "stampPhase", phase, orderId, companyId: user.company_id } });
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSavingPhase(null);
    }
  };

  const saveNote = async (orderId: string) => {
    if (!user?.id || !user?.company_id) return;
    const draft = noteDrafts[orderId] || "";
    setSavingNote(orderId);
    try {
      const existing = attendance[orderId];
      if (existing) {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .update({ notes: draft.trim() || null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .insert({
            company_id: user.company_id,
            order_id: orderId,
            waiter_id: user.id,
            notes: draft.trim() || null,
          });
        if (error) throw error;
      }
      toast({ title: "Note saved" });
      load();
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "saveNote", orderId, companyId: user.company_id } });
      toast({ title: "Could not save note", description: e?.message, variant: "destructive" });
    } finally {
      setSavingNote(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-md">
        <CardContent className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading service queue...
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="border-0 shadow-md">
        <CardContent className="py-6">
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 text-center dark:border-rose-900 dark:bg-rose-950/30">
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">Couldn&apos;t load your service queue</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{loadError}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChefHat className="w-5 h-5 text-brand-primary" />
            Service today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-slate-500">
            <PartyPopper className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No events to staff</p>
            <p className="text-xs mt-1">Events you're assigned to in the next 48h will appear here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ChefHat className="w-5 h-5 text-brand-primary" />
          Service today
          <Badge variant="outline" className="ml-auto text-[10px]">{orders.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {orders.map((o) => {
          const a = attendance[o.id];
          return (
            <Card key={o.id} className="border-slate-200">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    {/* ODOC G.5: tap event title to open the full
                        order doc with service team section auto-
                        expanded - venue contact, allergens,
                        dietary, briefing live there. */}
                    <Link
                      href={withSlug(staffOrderHref(o.id, "waiter"))}
                      className="text-sm font-semibold text-slate-900 truncate hover:text-brand-primary hover:underline inline-flex items-center gap-1"
                    >
                      {orderDisplayName(o)}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </Link>
                    <div className="text-xs text-slate-600 mt-0.5 space-y-0.5">
                      <p className="flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3 text-slate-400" />
                        {new Date(o.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                        {o.event_time && <span> · {o.event_time.slice(0, 5)}</span>}
                      </p>
                      {o.venue_name && (
                        <p className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {o.venue_name}
                        </p>
                      )}
                      {o.guest_count != null && (
                        <p className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-slate-400" />
                          {o.guest_count} guest{o.guest_count === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-slate-50 capitalize">{o.status.replace(/_/g, " ")}</Badge>
                </div>

                {/* Phase tracker. Each row collapses to a chip with the
                    timestamp once stamped. Stamping is irreversible
                    from the field UI - admins fix mistakes from
                    /admin/orders. */}
                <div className="space-y-1.5">
                  <PhaseRow label="On-site" iconKey="arrived" stampedAt={a?.arrived_at} disabled={!!a?.arrived_at} loading={savingPhase?.orderId === o.id && savingPhase.phase === "arrived_at"} onStamp={() => stampPhase(o.id, "arrived_at")} />
                  <PhaseRow label="Setup started" iconKey="setup" stampedAt={a?.setup_started_at} disabled={!a?.arrived_at || !!a?.setup_started_at} loading={savingPhase?.orderId === o.id && savingPhase.phase === "setup_started_at"} onStamp={() => stampPhase(o.id, "setup_started_at")} />
                  <PhaseRow label="Guests arrived" iconKey="guests" stampedAt={a?.guests_arrived_at} disabled={!a?.setup_started_at || !!a?.guests_arrived_at} loading={savingPhase?.orderId === o.id && savingPhase.phase === "guests_arrived_at"} onStamp={() => stampPhase(o.id, "guests_arrived_at")} />
                  <PhaseRow label="Service started" iconKey="service" stampedAt={a?.service_started_at} disabled={!a?.guests_arrived_at || !!a?.service_started_at} loading={savingPhase?.orderId === o.id && savingPhase.phase === "service_started_at"} onStamp={() => stampPhase(o.id, "service_started_at")} />
                  <PhaseRow label="Service ended" iconKey="ended" stampedAt={a?.service_ended_at} disabled={!a?.service_started_at || !!a?.service_ended_at} loading={savingPhase?.orderId === o.id && savingPhase.phase === "service_ended_at"} onStamp={() => stampPhase(o.id, "service_ended_at")} />
                  <PhaseRow label="Event complete" iconKey="complete" stampedAt={a?.event_complete_at} disabled={!a?.service_ended_at || !!a?.event_complete_at} loading={savingPhase?.orderId === o.id && savingPhase.phase === "event_complete_at"} onStamp={() => stampPhase(o.id, "event_complete_at")} primary />
                </div>

                {/* Equipment return signal */}
                {a?.event_complete_at && !a?.equipment_returned_at && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
                    <p className="text-xs text-amber-800 flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      Bringing equipment back?
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => stampPhase(o.id, "equipment_returned_at")}
                      disabled={savingPhase?.orderId === o.id && savingPhase.phase === "equipment_returned_at"}
                      className="h-7 text-xs border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                    >
                      Equipment returned
                    </Button>
                  </div>
                )}
                {a?.equipment_returned_at && (
                  <p className="text-[11px] text-brand-primary flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Equipment returned {new Date(a.equipment_returned_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}

                {/* Notes capture - admin reads on /admin/orders */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-600 inline-flex items-center gap-1 hover:text-slate-900">
                    <MessageSquareText className="w-3 h-3" />
                    {a?.notes ? "Notes" : "Add notes"}
                  </summary>
                  <div className="mt-2 space-y-2">
                    <Textarea
                      rows={2}
                      placeholder="Allergies, complaints, compliments, anything the office should know"
                      value={noteDrafts[o.id] ?? a?.notes ?? ""}
                      onChange={(e) => setNoteDrafts((s) => ({ ...s, [o.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      onClick={() => saveNote(o.id)}
                      disabled={savingNote === o.id}
                      className="bg-brand-primary text-white hover:bg-brand-primary/90"
                    >
                      {savingNote === o.id ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Saving</> : "Save notes"}
                    </Button>
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}

const PHASE_LABELS: Record<Phase, string> = {
  arrived_at: "On site",
  setup_started_at: "Setup started",
  guests_arrived_at: "Guests arrived",
  service_started_at: "Service started",
  service_ended_at: "Service ended",
  event_complete_at: "Event complete",
  equipment_returned_at: "Equipment returned",
};

function PhaseRow({ label, iconKey, stampedAt, disabled, loading, onStamp, primary }: {
  label: string;
  iconKey: "arrived" | "setup" | "guests" | "service" | "ended" | "complete";
  stampedAt: string | null | undefined;
  disabled: boolean;
  loading: boolean;
  onStamp: () => void;
  primary?: boolean;
}) {
  const Icon =
    iconKey === "arrived" ? MapPin :
    iconKey === "setup" ? Sparkles :
    iconKey === "guests" ? Users :
    iconKey === "service" ? Truck :
    iconKey === "ended" ? Clock :
    CheckCircle2;
  if (stampedAt) {
    return (
      <div className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-brand-primary/10 border border-brand-primary/20">
        <span className="inline-flex items-center gap-1.5 text-brand-primary font-medium">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
        <span className="text-[11px] text-brand-primary tabular-nums">
          {new Date(stampedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      onClick={onStamp}
      disabled={disabled || loading}
      className={`w-full justify-between h-9 ${primary ? "bg-brand-primary text-white hover:bg-brand-primary/90" : ""}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
    </Button>
  );
}
