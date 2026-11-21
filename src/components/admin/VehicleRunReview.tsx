import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Pencil, RefreshCw, Trash2, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { formatLocalDateTime } from "@/lib/localFormat";
import { DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";
import { tenantDateTime } from "@/lib/portalTime";
import { supabase } from "@/integrations/supabase/client";
import { driverPayService, driverShiftReviewReason } from "@/services/driverPayService";
import { vehicleService, type Vehicle, type VehicleDriverClockReview, type VehicleRunReviewRow } from "@/services/vehicleService";

type Props = { companyId: string | null; actorUserId?: string | null; vehicles: Vehicle[] };
type EditableBooking = { row: VehicleRunReviewRow; from: string; until: string; notes: string };
type EditableClock = { row: VehicleRunReviewRow; clock: VehicleDriverClockReview; start: string; end: string; status: "scheduled" | "active" | "completed" | "missed" | "cancelled"; notes: string };
type DeleteTarget = { kind: "booking"; row: VehicleRunReviewRow } | { kind: "clock"; row: VehicleRunReviewRow; clock: VehicleDriverClockReview };

function toTenantInput(value: string | null, timezone: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) => parts.find((part) => part.type === key)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromTenantInput(value: string, timezone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return match ? tenantDateTime(match[1], match[2], "00:00", timezone)?.toISOString() || null : null;
}

function clockDuration(clock: VehicleDriverClockReview): number | null {
  if (!clock.actual_start) return null;
  const start = new Date(clock.actual_start).getTime();
  const end = clock.actual_end ? new Date(clock.actual_end).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}

function getReviewReasons(row: VehicleRunReviewRow): string[] {
  const reasons: string[] = [];
  if (row.order_id && !row.order) reasons.push("Linked order is missing, deleted, or test data.");
  const plannedMinutes = (new Date(row.booked_until).getTime() - new Date(row.booked_from).getTime()) / 60_000;
  if (plannedMinutes > 24 * 60) reasons.push("Vehicle booking window is longer than 24 hours.");
  if (row.status === "planned" && ["delivered", "completed"].includes(String(row.order?.status || "").toLowerCase())) {
    reasons.push("Order is finished but this vehicle booking is still planned.");
  }
  if (row.order && ["delivered", "completed"].includes(String(row.order.status || "").toLowerCase()) && row.driver_shifts.length === 0) {
    reasons.push("Order is finished but no linked driver clock entry was found.");
  }
  for (const clock of row.driver_shifts) {
    const timeReason = driverShiftReviewReason(clock as any)
      || (clock.actual_end && clock.status !== "completed" ? "Clock-out exists but the timer is not marked completed." : null);
    if (timeReason) reasons.push(timeReason);
    if (clock.gps_distance_review_reason) reasons.push(clock.gps_distance_review_reason);
    if (clock.gps_distance_status === "unlinked") reasons.push("GPS route could not be matched to this clock entry.");
    const minutes = clockDuration(clock);
    if (minutes != null && plannedMinutes > 0 && minutes > plannedMinutes + 120) {
      reasons.push("Driver clock ran more than two hours beyond the planned vehicle window.");
    }
  }
  return Array.from(new Set(reasons));
}

function distanceSummary(clock: VehicleDriverClockReview): string {
  if (clock.gps_distance_status === "unlinked") return "GPS route not linked to this clock";
  if (clock.gps_distance_km == null) return "GPS distance not recorded";
  const actual = clock.gps_distance_km;
  const expected = clock.gps_expected_distance_km;
  if (expected == null) return `GPS ${actual.toFixed(1)} km · route estimate unavailable`;
  const delta = actual - expected;
  return `GPS ${actual.toFixed(1)} km · estimate ${expected.toFixed(1)} km · ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} km`;
}

export function VehicleRunReview({ companyId, actorUserId, vehicles }: Props) {
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<VehicleRunReviewRow[]>([]);
  const [timezone, setTimezone] = useState(DEFAULT_TENANT_TIMEZONE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [editingBooking, setEditingBooking] = useState<EditableBooking | null>(null);
  const [editingClock, setEditingClock] = useState<EditableClock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setLoadError("");
    try {
      const [records, company] = await Promise.all([
        vehicleService.getRunReviewRows(companyId),
        supabase.from("companies").select("timezone").eq("id", companyId).maybeSingle(),
      ]);
      if (company.error) throw company.error;
      setTimezone(company.data?.timezone || DEFAULT_TENANT_TIMEZONE);
      setRows(records);
    } catch (error: any) {
      const message = error?.message || "Could not load vehicle run records.";
      setLoadError(message);
      toast({ title: "Could not load vehicle runs", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const vehicleById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  const reviewCount = rows.reduce((count, row) => count + (getReviewReasons(row).length ? 1 : 0), 0);
  const visibleRows = showReviewOnly ? rows.filter((row) => getReviewReasons(row).length > 0) : rows;

  const saveBookingEdit = async () => {
    if (!companyId || !editingBooking) return;
    const bookedFrom = fromTenantInput(editingBooking.from, timezone);
    const bookedUntil = fromTenantInput(editingBooking.until, timezone);
    if (!bookedFrom || !bookedUntil || new Date(bookedUntil) <= new Date(bookedFrom)) {
      toast({ title: "Check the booking times", description: "End time must be after start time.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await vehicleService.updateVehicleBooking(editingBooking.row.id, companyId, {
        booked_from: bookedFrom, booked_until: bookedUntil, notes: editingBooking.notes.trim() || null,
      }, actorUserId);
      toast({ title: "Vehicle booking updated", description: "The change is recorded in the admin audit log." });
      setEditingBooking(null);
      await load();
    } catch (error: any) {
      toast({ title: "Could not update vehicle booking", description: error?.message || "Try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveClockEdit = async () => {
    if (!editingClock) return;
    const start = editingClock.start ? fromTenantInput(editingClock.start, timezone) : null;
    const end = editingClock.end ? fromTenantInput(editingClock.end, timezone) : null;
    if ((editingClock.start && !start) || (editingClock.end && !end) || (start && end && new Date(end) <= new Date(start))) {
      toast({ title: "Check the driver clock times", description: "Clock-out must be after clock-in. Leave it blank if that time was not recorded.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await driverPayService.updateShift(editingClock.clock.id, {
        actual_start: start,
        actual_end: end,
        status: editingClock.status,
        notes: editingClock.notes.trim() || null,
      }, undefined, actorUserId);
      if (!result.ok) throw new Error(result.error || "Could not update the driver clock.");
      toast({ title: "Driver clock updated", description: "Wages and the vehicle review now read the corrected source clock." });
      setEditingClock(null);
      await load();
    } catch (error: any) {
      toast({ title: "Could not update driver clock", description: error?.message || "Try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const deleteEntry = async () => {
    if (!companyId || !deleteTarget) return;
    setSaving(true);
    try {
      if (deleteTarget.kind === "booking") {
        await vehicleService.deleteVehicleBooking(deleteTarget.row.id, companyId, actorUserId);
        toast({ title: "Vehicle booking deleted", description: "Linked driver clock history stays in Wages; the vehicle link was cleared where it matched." });
      } else {
        const result = await driverPayService.deleteShift(deleteTarget.clock.id, undefined, actorUserId, "Admin deleted from vehicle run review");
        if (!result.ok) throw new Error(result.error || "Could not delete the driver clock.");
        toast({ title: "Driver clock deleted", description: "It is removed from wage calculations and retained in the audit log." });
      }
      setDeleteTarget(null);
      await load();
    } catch (error: any) {
      toast({ title: "Could not delete entry", description: error?.message || "Try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <section id="vehicle-runs-review" data-chat-section="admin.vehicles.runs" data-chat-section-label="Vehicle runs and driver distance review" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Vehicle runs and driver distance</h2>
          <p className="mt-0.5 text-xs text-slate-600">Review each vehicle assignment with its linked order, driver clock entries, and actual GPS kilometres against the route estimate.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reviewCount > 0 && <Badge className="border-0 bg-amber-100 text-amber-900">{reviewCount} need review</Badge>}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh vehicle runs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
        <div className="flex w-full items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <p className="text-xs text-slate-500">{rows.length} recent records · maximum 1,000</p>
          <Button type="button" variant={showReviewOnly ? "default" : "outline"} size="sm" className="h-8" onClick={() => setShowReviewOnly((value) => !value)}><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />{showReviewOnly ? "Showing review items" : "Review items"}</Button>
        </div>
      </div>

      {loadError && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loadError}</div>}
      {rows.length > 0 && rows.some((row) => !row.gps_columns_available) && <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Vehicle bookings and driver clocks are available, but GPS route distances are not set up in this database yet.</div>}
      {rows.some((row) => !row.gps_attribution_available) && <div role="status" className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">This database can’t link every clock to a specific sitting route. GPS is shown only where one delivery route matches the driver and order.</div>}
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading vehicle runs…</div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center"><Truck className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm font-medium text-slate-800">{showReviewOnly ? "No vehicle runs need review" : "No vehicle runs recorded"}</p><p className="mt-1 text-xs text-slate-500">Vehicle assignments appear here with driver clocks and captured GPS distances.</p></div>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((row) => {
            const vehicle = vehicleById.get(row.vehicle_id);
            const reasons = getReviewReasons(row);
            const planMinutes = Math.max(0, Math.round((new Date(row.booked_until).getTime() - new Date(row.booked_from).getTime()) / 60_000));
            const orderLabel = row.order?.order_number || (row.order_id ? `Order ${row.order_id.slice(0, 8)}` : "Unlinked booking");
            return (
              <article key={row.id} className={`rounded-lg border bg-white p-3 ${reasons.length ? "border-amber-300" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.order_id ? <Link href={withSlug(`/admin/orders?orderId=${encodeURIComponent(row.order_id)}`)} className="text-sm font-semibold text-brand-primary hover:underline">{orderLabel}<ExternalLink className="ml-1 inline h-3 w-3" /></Link> : <span className="text-sm font-semibold text-slate-800">{orderLabel}</span>}
                      {reasons.length ? <Badge className="border-0 bg-amber-100 text-amber-900">Review needed</Badge> : <Badge variant="outline" className="text-slate-600">{row.status.replaceAll("_", " ")}</Badge>}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">{row.order?.client_name || "Client unavailable"} · {row.order?.event_date || "No event date"} · {row.driver_name || "No driver linked"}</p>
                    <p className="mt-1 text-xs text-slate-700">{vehicle?.nickname ? `${vehicle.nickname} · ` : ""}{vehicle?.plate || "Vehicle unavailable"} · Planned {formatLocalDateTime(row.booked_from)} – {formatLocalDateTime(row.booked_until)} ({(planMinutes / 60).toFixed(1)}h)</p>
                    {reasons.length > 0 && <ul className="mt-2 space-y-1 text-xs font-medium text-amber-900">{reasons.map((reason) => <li key={reason} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{reason}</li>)}</ul>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setEditingBooking({ row, from: toTenantInput(row.booked_from, timezone), until: toTenantInput(row.booked_until, timezone), notes: row.notes || "" })}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit booking</Button>
                    <Button type="button" size="sm" variant="outline" className="h-9 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setDeleteTarget({ kind: "booking", row })}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button>
                  </div>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <h3 className="text-xs font-semibold text-slate-800">Driver clock and GPS review <span className="ml-1 text-slate-500">{row.driver_shifts.length}</span></h3>
                  {row.driver_shifts.length === 0 ? <p className="mt-1 text-xs text-slate-500">No driver clock entry linked yet. GPS distance will appear after the driver timer closes and the route is captured.</p> : (
                    <ul className="mt-2 space-y-2">
                      {row.driver_shifts.map((clock) => {
                        const timeReason = driverShiftReviewReason(clock as any)
                          || (clock.actual_end && clock.status !== "completed" ? "Clock-out exists but the timer is not marked completed." : null);
                        const minutes = clockDuration(clock);
                        const review = timeReason || clock.gps_distance_review_reason
                          || (clock.gps_distance_status === "unlinked" ? "GPS route could not be matched to this clock entry." : null);
                        return (
                          <li key={clock.id} className={`flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-md border p-2.5 ${review ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50/60"}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-slate-800">{clock.service_sitting_id ? "Sitting delivery" : "Delivery clock"}</span>
                                {review && <Badge className="border-0 bg-amber-100 text-amber-900">Review</Badge>}
                                {clock.status === "active" && <Badge variant="outline" className="text-blue-700">Clock running</Badge>}
                              </div>
                              <p className="mt-1 text-xs text-slate-600">Clock-in {clock.actual_start ? formatLocalDateTime(clock.actual_start) : "missing"} → clock-out {clock.actual_end ? formatLocalDateTime(clock.actual_end) : clock.status === "active" ? "still running" : "missing"}{minutes != null && ` · ${Math.floor(minutes / 60)}h ${minutes % 60}m`} · {clock.status}</p>
                              <p className="mt-1 text-xs tabular-nums text-slate-700">{distanceSummary(clock)}{clock.gps_distance_status === "partial" ? " · partial GPS capture" : ""}</p>
                              {review && <p className="mt-1 text-xs font-medium text-amber-900">{review}</p>}
                              {clock.notes && <p className="mt-1 text-xs text-slate-500">{clock.notes}</p>}
                              {clock.gps_distance_review_reason && row.driver_id && <Link href={withSlug(`/admin/driver-settlement?driver=${encodeURIComponent(row.driver_id)}`)} className="mt-1 inline-flex min-h-7 items-center text-xs font-semibold text-brand-primary hover:underline">Open driver settlement <ExternalLink className="ml-1 h-3 w-3" /></Link>}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setEditingClock({ row, clock, start: toTenantInput(clock.actual_start, timezone), end: toTenantInput(clock.actual_end, timezone), status: clock.status as EditableClock["status"], notes: clock.notes || "" })}><Pencil className="mr-1 h-3 w-3" />Edit clock</Button>
                              <Button type="button" size="sm" variant="outline" className="h-8 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setDeleteTarget({ kind: "clock", row, clock })}><Trash2 className="mr-1 h-3 w-3" />Delete clock</Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingBooking} onOpenChange={(open) => !open && !saving && setEditingBooking(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit vehicle booking</DialogTitle><DialogDescription>Correct the planned vehicle window or admin note. Changes are audit logged. Driver clock records are edited separately below so Wages stays in sync.</DialogDescription></DialogHeader>
          {editingBooking && <div className="space-y-3 py-1"><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="vehicle-run-from">Planned start</Label><Input id="vehicle-run-from" type="datetime-local" value={editingBooking.from} onChange={(event) => setEditingBooking({ ...editingBooking, from: event.target.value })} className="mt-1" /></div><div><Label htmlFor="vehicle-run-until">Planned end</Label><Input id="vehicle-run-until" type="datetime-local" value={editingBooking.until} onChange={(event) => setEditingBooking({ ...editingBooking, until: event.target.value })} className="mt-1" /></div></div><div><Label htmlFor="vehicle-run-notes">Admin note</Label><Input id="vehicle-run-notes" value={editingBooking.notes} onChange={(event) => setEditingBooking({ ...editingBooking, notes: event.target.value })} maxLength={1000} className="mt-1" /></div></div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingBooking(null)} disabled={saving}>Cancel</Button><Button type="button" onClick={() => void saveBookingEdit()} disabled={saving}>{saving ? "Saving…" : "Save booking"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingClock} onOpenChange={(open) => !open && !saving && setEditingClock(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>Edit driver clock</DialogTitle><DialogDescription>This updates the original driver time record used by Wages and keeps the audit history.</DialogDescription></DialogHeader>
          {editingClock && <div className="grid gap-3 py-1 sm:grid-cols-2"><div><Label htmlFor="vehicle-clock-in">Clock-in</Label><Input id="vehicle-clock-in" type="datetime-local" value={editingClock.start} onChange={(event) => setEditingClock({ ...editingClock, start: event.target.value })} className="mt-1" /></div><div><Label htmlFor="vehicle-clock-out">Clock-out</Label><Input id="vehicle-clock-out" type="datetime-local" value={editingClock.end} onChange={(event) => setEditingClock({ ...editingClock, end: event.target.value })} className="mt-1" /></div><div><Label htmlFor="vehicle-clock-status">Clock status</Label><select id="vehicle-clock-status" value={editingClock.status} onChange={(event) => setEditingClock({ ...editingClock, status: event.target.value as EditableClock["status"] })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="completed">Completed</option><option value="missed">Missed</option><option value="cancelled">Cancelled</option></select></div><div className="sm:col-span-2"><Label htmlFor="vehicle-clock-note">Admin note</Label><Input id="vehicle-clock-note" value={editingClock.notes} onChange={(event) => setEditingClock({ ...editingClock, notes: event.target.value })} className="mt-1" /></div></div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingClock(null)} disabled={saving}>Cancel</Button><Button type="button" onClick={() => void saveClockEdit()} disabled={saving}>{saving ? "Saving…" : "Save clock"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !saving && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{deleteTarget?.kind === "clock" ? "Delete driver clock entry?" : "Delete vehicle booking?"}</DialogTitle><DialogDescription>{deleteTarget?.kind === "clock" ? "This soft-deletes the original driver clock, removes it from wage calculations, and preserves the change in the audit log." : "This removes the vehicle booking and clears that vehicle assignment from the order if it still matches. Driver clock history remains in Wages."}</DialogDescription></DialogHeader>
          {deleteTarget && <p className="text-sm text-slate-700">{deleteTarget.row.order?.order_number || deleteTarget.row.order_id || "Unlinked booking"} · {vehicleById.get(deleteTarget.row.vehicle_id)?.plate || "Vehicle"}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>Keep entry</Button><Button type="button" variant="destructive" onClick={() => void deleteEntry()} disabled={saving}>{saving ? "Deleting…" : "Delete entry"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
