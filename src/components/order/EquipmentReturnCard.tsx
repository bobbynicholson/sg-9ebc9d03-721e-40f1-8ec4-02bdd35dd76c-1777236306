/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * "Equipment return" on the order page.
 *
 * Everyone who can open the order sees who is responsible for bringing the
 * equipment back, the live return status (collection booked / on the way /
 * back at base / overdue) and, once back, who returned it and the count.
 * Admins can:
 *   - change who returns it (equipmentReturnOps.changeEquipmentReturn:
 *     cancels / books / re-times the collection trip and tells the
 *     driver(s) and waiter(s) affected)
 *   - book the driver collection, or hand it to another driver
 *     (equipmentReturnOps.bookOrReassignCollection: new driver told, the
 *     previous one told it moved)
 */
import { tenantDateTime } from "@/lib/portalTime";
import { useCallback, useEffect, useState } from "react";
import { PackageCheck, Loader2, AlertTriangle, CheckCircle2, Clock, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import {
  EQUIPMENT_RETURN_METHODS, EQUIPMENT_RETURN_OPTIONS, computeReturnStatus, isDriverCollection,
  resolveEquipmentReturn, type EquipmentReturnMethod, type ReturnStatus,
} from "@/lib/equipmentReturn";

interface Trip { id: string; driver_id: string | null; status: string | null; scheduled_for: string | null; picked_up_at: string | null; completed_at: string | null }

export function EquipmentReturnCard({
  order, canEdit, onChanged,
}: {
  order: {
    id: string;
    company_id?: string;
    event_date?: string | null;
    event_time?: string | null;
    status?: string | null;
    delivered_at?: string | null;
    equipment_return_method?: string | null;
    collection_next_day?: boolean | null;
    requires_waiter?: boolean | null;
    waiter_service_required?: boolean | null;
  };
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const method = resolveEquipmentReturn(order);
  const chosen = !!order.equipment_return_method;
  const opt = EQUIPMENT_RETURN_OPTIONS[method];
  const delivered = !!order.delivered_at || ["delivered", "completed"].includes(String(order.status || ""));
  const hasWaiter = !!(order.requires_waiter || order.waiter_service_required);

  const [status, setStatus] = useState<ReturnStatus | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [returnedBy, setReturnedBy] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [pickDriver, setPickDriver] = useState("");

  const load = useCallback(async () => {
    try {
      const [col, att, ord] = await Promise.all([
        (supabase as any).from("driver_assignments")
          .select("id, driver_id, status, scheduled_for, picked_up_at, completed_at")
          .eq("order_id", order.id).eq("assignment_type", "collection").neq("status", "cancelled").maybeSingle(),
        (supabase as any).from("event_attendance")
          .select("waiter_id, event_complete_at, equipment_returned_at").eq("order_id", order.id),
        (supabase as any).from("orders").select("waiter_duration_hours").eq("id", order.id).maybeSingle(),
      ]);
      // returned_by_user_id needs migration 20261007170000; fall back without it.
      let bk = await (supabase as any).from("equipment_bookings")
        .select("quantity, returned_quantity, status, returned_by_user_id").eq("order_id", order.id);
      if (bk.error) {
        bk = await (supabase as any).from("equipment_bookings")
          .select("quantity, returned_quantity, status").eq("order_id", order.id);
      }
      const tripRow = (col?.data as Trip) || null;
      const attRows = (att?.data as any[]) || [];
      const bookings = (bk?.data as any[]) || [];
      setTrip(tripRow);

      const ids = new Set<string>();
      if (tripRow?.driver_id) ids.add(tripRow.driver_id);
      const returnerId = bookings.map((b) => b.returned_by_user_id).find(Boolean)
        || attRows.find((a) => a.equipment_returned_at)?.waiter_id
        || null;
      if (returnerId) ids.add(returnerId);
      if (ids.size) {
        const { data: profs } = await (supabase as any).from("profiles").select("id, full_name, email").in("id", Array.from(ids));
        const m: Record<string, string> = {};
        for (const p of (profs || []) as any[]) m[p.id] = p.full_name || p.email || "Unknown";
        setNames(m);
        setReturnedBy(returnerId ? m[returnerId] || null : null);
      } else {
        setReturnedBy(null);
      }

      const start = order.event_date
        ? (tenantDateTime(order.event_date, String(order.event_time || "12:00").slice(0, 5)) ?? new Date(NaN))
        : null;
      setStatus(computeReturnStatus({
        method,
        now: new Date(),
        eventStart: start && !Number.isNaN(start.getTime()) ? start : null,
        waiterHours: (ord?.data as any)?.waiter_duration_hours ?? null,
        collection: tripRow,
        attendance: attRows,
        bookings,
      }));
    } catch {
      setStatus(null);
    }
  }, [order.id, order.event_date, order.event_time, method]);
  useEffect(() => { void load(); }, [load]);

  // Drivers for the collection picker (admins, driver collections only).
  useEffect(() => {
    if (!canEdit || !isDriverCollection(method) || !order.company_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles").select("id, full_name")
        .eq("company_id", order.company_id).eq("role", "driver")
        .order("full_name", { ascending: true });
      if (!cancelled) setDrivers((data as any[]) || []);
    })();
    return () => { cancelled = true; };
  }, [canEdit, method, order.company_id]);

  const change = async (next: EquipmentReturnMethod) => {
    if (next === method && chosen) return;
    setSaving(true);
    try {
      const { changeEquipmentReturn } = await import("@/services/equipmentReturnOps");
      const r = await changeEquipmentReturn({ orderId: order.id, next });
      if (!r.ok) throw new Error(r.error || "Could not update");
      toast({ title: "Equipment return updated", description: r.notes.join(" ") || EQUIPMENT_RETURN_OPTIONS[next].detail });
      onChanged?.();
      await load();
    } catch (e) {
      toast({ title: "Could not update", description: dbErrorMessage(e, { entity: "order", fallback: "Try again" }), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const bookCollection = async () => {
    if (!pickDriver) return;
    setSaving(true);
    try {
      const { bookOrReassignCollection } = await import("@/services/equipmentReturnOps");
      const r = await bookOrReassignCollection({ orderId: order.id, driverId: pickDriver });
      if (!r.ok) throw new Error(r.error || "Could not book the collection");
      toast({
        title: r.mode === "reassigned" ? "Collection handed to another driver" : r.mode === "booked" ? "Collection booked" : "No change",
        description: r.mode === "unchanged" ? "That driver already has this collection." : "The driver has been notified.",
      });
      setPickDriver("");
      await load();
    } catch (e) {
      toast({ title: "Could not book the collection", description: dbErrorMessage(e, { entity: "collection", fallback: "Try again" }), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const tripOpen = !trip || ["assigned", "accepted"].includes(String(trip.status));
  const showDriverPicker = canEdit && isDriverCollection(method) && status?.state !== "returned" && tripOpen && (!!trip || delivered);

  return (
    <div id="order-equipment-return" className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <PackageCheck className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-slate-900">
              <span className="font-semibold">Equipment return:</span> {opt.responsible}
            </p>
            <p className="text-[11px] text-slate-500">
              {opt.detail}
              {!chosen && " (Not chosen on the quote, so this follows the default rule.)"}
            </p>
            {method === "waiter" && !hasWaiter && (
              <p className="text-[11px] font-medium text-amber-800">No waiter is booked on this order. Choose who brings the equipment back.</p>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            <select
              value={chosen ? method : ""}
              onChange={(e) => e.target.value && change(e.target.value as EquipmentReturnMethod)}
              disabled={saving}
              aria-label="Who brings the equipment back"
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
            >
              {!chosen && <option value="">Choose who returns it...</option>}
              {EQUIPMENT_RETURN_METHODS.map((m) => (
                <option key={m} value={m}>{EQUIPMENT_RETURN_OPTIONS[m].label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Collection trip: driver + time (driver collections). */}
      {isDriverCollection(method) && (trip || delivered) && (
        <p className="text-[11px] text-slate-700 flex items-center gap-1 pl-6">
          <Truck className="w-3 h-3" />
          {trip
            ? <>Collection driver: <span className="font-semibold">{(trip.driver_id && names[trip.driver_id]) || "Unknown"}</span>
                {trip.scheduled_for ? ` · ${new Date(trip.scheduled_for).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</>
            : <span className="font-medium text-amber-800">No collection trip booked yet - choose a driver.</span>}
        </p>
      )}

      {/* Live status + who returned it. */}
      {status && status.state !== "not_applicable" && (
        <p className={`pl-6 text-[11px] font-medium flex items-center gap-1 ${
          status.state === "overdue" ? "text-rose-700"
            : status.state === "returned" ? (status.missing ? "text-amber-800" : "text-emerald-700")
            : "text-slate-700"}`}>
          {status.state === "overdue" ? <AlertTriangle className="w-3 h-3" />
            : status.state === "returned" ? <CheckCircle2 className="w-3 h-3" />
            : <Clock className="w-3 h-3" />}
          {status.text}
          {status.state === "returned" && returnedBy ? ` Returned by ${returnedBy}.` : ""}
          {status.state !== "returned" && status.booked > 0 ? ` ${status.booked} item${status.booked === 1 ? "" : "s"} out.` : ""}
        </p>
      )}

      {showDriverPicker && (
        <div className="pl-6 flex flex-wrap items-center gap-2">
          <select
            value={pickDriver}
            onChange={(e) => setPickDriver(e.target.value)}
            disabled={saving}
            aria-label="Collection driver"
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">{trip ? "Give the collection to..." : "Choose the collection driver..."}</option>
            {drivers.filter((d) => d.id !== trip?.driver_id).map((d) => (
              <option key={d.id} value={d.id}>{d.full_name || "Driver"}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!pickDriver || saving} onClick={bookCollection}>
            {trip ? "Reassign collection" : "Book collection"}
          </Button>
        </div>
      )}
    </div>
  );
}
