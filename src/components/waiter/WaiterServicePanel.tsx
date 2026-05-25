/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WTR-A: Waiter / on-site server service panel.
 *
 * Renders on /team-portal/driver/dashboard when the user has the
 * `waiter` role (alongside any driver widgets). Shows the user's
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { toLocalISO } from "@/lib/localDate";

const ROUTE = "/team-portal/driver/dashboard";

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
  notes: string | null;
}

export function WaiterServicePanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [loading, setLoading] = useState(true);
  const [savingPhase, setSavingPhase] = useState<{ orderId: string; phase: Phase } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.company_id || !user?.id) return;
    setLoading(true);
    try {
      // WTR-A: pull orders assigned to me as a waiter. The driver
      // dashboard already pulls orders by assigned_driver_id; we
      // pull by assigned_waiter_id (column added in a follow-up
      // migration). For the scaffold, fall back to orders where I
      // am the assigned_driver since the same person often does
      // both - the page is role-aware, not strict.
      const today = toLocalISO(new Date());
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 2);
      const horizonIso = toLocalISO(horizon);
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, order_number, event_name, event_date, event_time, venue_name, venue_address, guest_count, client_name, status")
        .eq("company_id", user.company_id)
        .eq("assigned_driver_id", user.id)
        .gte("event_date", today)
        .lte("event_date", horizonIso)
        .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered"])
        .order("event_date", { ascending: true });
      if (error) throw error;
      setOrders((data || []) as AssignedOrder[]);

      const ids = (data || []).map((o: any) => o.id);
      if (ids.length > 0) {
        const { data: attRows } = await (supabase as any)
          .from("event_attendance")
          .select("id, order_id, arrived_at, setup_started_at, guests_arrived_at, service_started_at, service_ended_at, event_complete_at, equipment_returned_at, notes")
          .eq("company_id", user.company_id)
          .eq("waiter_id", user.id)
          .in("order_id", ids);
        const map: Record<string, Attendance> = {};
        (attRows || []).forEach((a: any) => { map[a.order_id] = a; });
        setAttendance(map);
      } else {
        setAttendance({});
      }
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "loadWaiterAssignments", companyId: user.company_id } });
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
      .channel(`waiter-attendance:${user.id}`)
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
      if (existing) {
        const { error } = await (supabase as any)
          .from("event_attendance")
          .update({ [phase]: nowIso })
          .eq("id", existing.id);
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
      toast({ title: PHASE_LABELS[phase], description: "Stamped now" });
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

  if (orders.length === 0) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChefHat className="w-5 h-5 text-orange-600" />
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
          <ChefHat className="w-5 h-5 text-orange-600" />
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
                    <p className="text-sm font-semibold text-slate-900 truncate">{o.event_name || o.client_name || "Event"}</p>
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
                      className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
                    >
                      Equipment returned
                    </Button>
                  </div>
                )}
                {a?.equipment_returned_at && (
                  <p className="text-[11px] text-emerald-700 flex items-center gap-1">
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
                      className="bg-orange-600 hover:bg-orange-700"
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
      <div className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-emerald-50 border border-emerald-200">
        <span className="inline-flex items-center gap-1.5 text-emerald-800 font-medium">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
        <span className="text-[11px] text-emerald-700 tabular-nums">
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
      className={`w-full justify-between h-9 ${primary ? "bg-orange-600 hover:bg-orange-700" : ""}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
    </Button>
  );
}
