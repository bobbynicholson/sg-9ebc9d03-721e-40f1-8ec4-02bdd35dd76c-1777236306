/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck - Supabase generated types are stale on the new
// orders.assigned_vehicle_id / secondary_vehicle_id / requires_two_drivers
// columns and on the vehicle_bookings table. Mirroring the pattern used by
// vehicleService.ts and order-assignments.tsx until database.types.ts is
// regenerated.
/**
 * VehiclePickerDialog - pick or override the vehicle on a single order.
 *
 * Used from:
 *   - /admin/order-assignments (Dispatch Queue) row "Vehicle" cell
 *   - /admin/orders detail modal "Dispatch" card
 *
 * Surfaces ranked candidates from vehicleService.findAvailableVehicles
 * for the order's round-trip window. Re-running the upsertBookingForOrder
 * cancels the previous booking and inserts the new one, keeping the
 * vehicle_bookings table the single source of truth for availability.
 *
 * Two slots: primary vehicle and a secondary vehicle for multi-vehicle
 * runs. Both share the same available list (the dispatcher picks both
 * here so the time-window logic stays aware of the secondary too).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Truck, Snowflake, Flame, Users, User, Building2, AlertTriangle, X,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  vehicleService,
  computeOrderVehicleWindow,
  shouldRequireTwoDrivers,
  type AvailabilityResult,
  type Vehicle,
} from "@/services/vehicleService";
import { supabase } from "@/integrations/supabase/client";

interface OrderShape {
  id: string;
  client_name?: string | null;
  event_date: string;
  event_time?: string | null;
  guest_count?: number | null;
  requires_refrigeration?: boolean | null;
  requires_waiter?: boolean | null;
  assigned_driver_id?: string | null;
  secondary_driver_id?: string | null;
  assigned_vehicle_id?: string | null;
  secondary_vehicle_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  order: OrderShape;
  onChanged?: () => void;
}

export function VehiclePickerDialog({
  open, onOpenChange, companyId, order, onChanged,
}: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"primary" | "secondary">("primary");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<AvailabilityResult[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(order.assigned_vehicle_id ?? null);
  const [secondaryId, setSecondaryId] = useState<string | null>(order.secondary_vehicle_id ?? null);

  const runWindow = useMemo(() => computeOrderVehicleWindow({
    eventDate: order.event_date,
    eventTime: order.event_time,
    requiresWaiter: !!order.requires_waiter,
  }), [order.event_date, order.event_time, order.requires_waiter]);

  useEffect(() => {
    if (!open || !companyId) return;
    setPrimaryId(order.assigned_vehicle_id ?? null);
    setSecondaryId(order.secondary_vehicle_id ?? null);
    setLoading(true);
    vehicleService.findAvailableVehicles({
      companyId,
      bookedFrom: runWindow.booked_from.toISOString(),
      bookedUntil: runWindow.booked_until.toISOString(),
      requiresRefrigeration: !!order.requires_refrigeration,
      guestCount: order.guest_count ?? null,
      driverId: order.assigned_driver_id ?? null,
      ignoreBookingForOrderId: order.id,
    }).then(setCandidates).finally(() => setLoading(false));
  // We intentionally re-fetch when the order id changes. The other
  // dependencies are stable for a given dialog open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, order.id]);

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });

  const setPrimary = async (vehicleId: string) => {
    if (!companyId) return;
    setBusy(true);
    try {
      await vehicleService.upsertBookingForOrder({
        companyId,
        orderId: order.id,
        vehicleId,
        driverId: order.assigned_driver_id ?? null,
        bookedFrom: runWindow.booked_from,
        bookedUntil: runWindow.booked_until,
        notes: "Primary vehicle picked from the override dialog.",
      });

      // Run the two-driver heuristic again now that the operator may
      // have picked a smaller / larger vehicle.
      const v = candidates.find((c) => c.vehicle.id === vehicleId)?.vehicle as Vehicle | undefined;
      const needs = shouldRequireTwoDrivers({
        guestCount: order.guest_count ?? null,
        vehicleRequiresTwoPeople: !!v?.requires_two_people,
        requiresWaiter: !!order.requires_waiter,
      });

      await supabase
        .from("orders")
        .update({
          assigned_vehicle_id: vehicleId,
          requires_two_drivers: needs.required,
        })
        .eq("id", order.id);

      setPrimaryId(vehicleId);
      toast({
        title: "Vehicle updated",
        description: needs.required
          ? `Booked ${v?.plate}. ${needs.reason}`
          : `Booked ${v?.plate}.`,
      });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Could not book vehicle", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const setSecondary = async (vehicleId: string) => {
    if (!companyId) return;
    setBusy(true);
    try {
      // We mirror the primary booking: a row in vehicle_bookings with
      // the same window. Both rows can co-exist for the same order.
      await supabase
        .from("vehicle_bookings")
        .insert([{
          company_id: companyId,
          vehicle_id: vehicleId,
          order_id: order.id,
          driver_id: order.secondary_driver_id ?? null,
          booked_from: runWindow.booked_from.toISOString(),
          booked_until: runWindow.booked_until.toISOString(),
          status: "planned",
          notes: "Secondary vehicle for a multi-vehicle run.",
        }]);
      await supabase
        .from("orders")
        .update({
          secondary_vehicle_id: vehicleId,
          // multi-vehicle implies multi-driver
          requires_two_drivers: true,
        })
        .eq("id", order.id);

      const v = candidates.find((c) => c.vehicle.id === vehicleId)?.vehicle;
      setSecondaryId(vehicleId);
      toast({
        title: "Secondary vehicle added",
        description: `${v?.plate} joining the run. Make sure a co-driver is assigned.`,
      });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Could not add vehicle", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clearPrimary = async () => {
    if (!companyId) return;
    setBusy(true);
    try {
      await vehicleService.cancelBookingsForOrder(order.id);
      await supabase
        .from("orders")
        .update({
          assigned_vehicle_id: null,
          secondary_vehicle_id: null,
        })
        .eq("id", order.id);
      setPrimaryId(null);
      setSecondaryId(null);
      toast({ title: "Vehicle removed", description: "All bookings cleared. Reassigning a driver will auto-book again." });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Could not clear", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const clearSecondary = async () => {
    if (!companyId || !secondaryId) return;
    setBusy(true);
    try {
      // Cancel the booking row for the secondary, leave the primary alone.
      await supabase
        .from("vehicle_bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("order_id", order.id)
        .eq("vehicle_id", secondaryId)
        .in("status", ["planned", "on_route"]);
      await supabase
        .from("orders")
        .update({ secondary_vehicle_id: null })
        .eq("id", order.id);
      setSecondaryId(null);
      toast({ title: "Secondary vehicle removed" });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Could not clear", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // The list shown in each tab is filtered so the primary and secondary
  // never collide with each other.
  const visible = useMemo(() => {
    if (tab === "primary") return candidates.filter((c) => c.vehicle.id !== secondaryId);
    return candidates.filter((c) => c.vehicle.id !== primaryId);
  }, [candidates, tab, primaryId, secondaryId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            Vehicle for {order.client_name || "order"}
          </DialogTitle>
          <DialogDescription>
            Round-trip window: <span className="font-mono">{fmtTime(runWindow.booked_from)}</span>
            {" "}to <span className="font-mono">{fmtTime(runWindow.booked_until)}</span> on{" "}
            {new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}.
            Vehicles already booked for this window are filtered out.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs mb-3">
          {([
            { id: "primary",   label: "Primary vehicle" },
            { id: "secondary", label: "Add secondary vehicle" },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 px-3 py-1.5 rounded-md ${
                tab === t.id
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "primary" ? (
          <div className="space-y-2">
            {primaryId && (
              <CurrentBookingRow
                vehicle={candidates.find((c) => c.vehicle.id === primaryId)?.vehicle ?? null}
                onClear={clearPrimary}
                busy={busy}
                role="Primary"
              />
            )}
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-3 mb-1">
              {primaryId ? "Switch to a different vehicle" : "Available for this window"}
            </p>
            {loading ? (
              <LoadingRows />
            ) : visible.length === 0 ? (
              <EmptyRow message="No vehicles free for this run. Free one by adjusting another order, or add a new vehicle on /admin/vehicles." />
            ) : (
              visible.map((c, i) => (
                <CandidateRow
                  key={c.vehicle.id}
                  candidate={c}
                  topMatch={i === 0}
                  selected={primaryId === c.vehicle.id}
                  onPick={() => setPrimary(c.vehicle.id)}
                  busy={busy}
                />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {secondaryId && (
              <CurrentBookingRow
                vehicle={candidates.find((c) => c.vehicle.id === secondaryId)?.vehicle ?? null}
                onClear={clearSecondary}
                busy={busy}
                role="Secondary"
              />
            )}
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-3 mb-1">
              Add a second vehicle for this run
            </p>
            <p className="text-xs text-slate-500 mb-2">
              Multi-vehicle runs auto-flag the order as needing two drivers. Assign a secondary
              driver from the Dispatch Queue once the vehicle is booked.
            </p>
            {loading ? (
              <LoadingRows />
            ) : visible.length === 0 ? (
              <EmptyRow message="No second vehicle available for this window." />
            ) : (
              visible.map((c, i) => (
                <CandidateRow
                  key={c.vehicle.id}
                  candidate={c}
                  topMatch={i === 0}
                  selected={secondaryId === c.vehicle.id}
                  onPick={() => setSecondary(c.vehicle.id)}
                  busy={busy}
                />
              ))
            )}
          </div>
        )}

        <DialogFooter className="mt-3">
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VehicleBadges({ v }: { v: Vehicle | null }) {
  if (!v) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {v.refrigerated && (
        <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] gap-1">
          <Snowflake className="w-3 h-3" /> Fridge
        </Badge>
      )}
      {v.has_warmer && (
        <Badge className="bg-orange-100 text-orange-800 border-0 text-[10px] gap-1">
          <Flame className="w-3 h-3" /> Warmer
        </Badge>
      )}
      {v.requires_two_people && (
        <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px] gap-1">
          <Users className="w-3 h-3" /> 2-person
        </Badge>
      )}
      {v.owner_kind === "driver" ? (
        <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] gap-1">
          <User className="w-3 h-3" /> Driver-owned
        </Badge>
      ) : (
        <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] gap-1">
          <Building2 className="w-3 h-3" /> Company
        </Badge>
      )}
    </div>
  );
}

function CurrentBookingRow({
  vehicle, onClear, busy, role,
}: {
  vehicle: Vehicle | null;
  onClear: () => void;
  busy: boolean;
  role: string;
}) {
  if (!vehicle) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
        Currently booked vehicle is no longer in the fleet.
        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy} className="ml-2 h-7">
          Clear
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-brand-primary font-semibold mb-0.5">
            {role} booked
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {vehicle.nickname ? `${vehicle.nickname} ` : ""}
            <span className="font-mono text-slate-600">{vehicle.plate}</span>
          </p>
          <div className="mt-1.5"><VehicleBadges v={vehicle} /></div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={busy}
          className="text-rose-700 hover:text-rose-800 hover:bg-rose-50 h-7"
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Remove
        </Button>
      </div>
    </div>
  );
}

function CandidateRow({
  candidate, topMatch, selected, onPick, busy,
}: {
  candidate: AvailabilityResult;
  topMatch: boolean;
  selected: boolean;
  onPick: () => void;
  busy: boolean;
}) {
  const v = candidate.vehicle;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy || selected}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        selected
          ? "border-brand-primary/30 bg-brand-primary/10 cursor-default"
          : topMatch
            ? "border-brand-primary bg-brand-primary/10 hover:bg-brand-primary/15"
            : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {topMatch && !selected && (
              <span className="text-[9px] font-semibold uppercase tracking-wide bg-brand-primary text-white px-1.5 py-0.5 rounded">
                Top match
              </span>
            )}
            {selected && (
              <span className="text-[9px] font-semibold uppercase tracking-wide bg-brand-primary/90 text-white px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Currently booked
              </span>
            )}
            <p className="text-sm font-medium text-slate-900">
              {v.nickname ? `${v.nickname} ` : ""}
              <span className="font-mono text-slate-500">{v.plate}</span>
            </p>
          </div>
          <div className="mb-1.5"><VehicleBadges v={v} /></div>
          {candidate.reasons.length > 0 && (
            <p className="text-xs text-slate-600">
              {candidate.reasons.slice(0, 2).join(" · ")}
            </p>
          )}
          {candidate.warnings.length > 0 && (
            <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3" />
              {candidate.warnings[0]}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-2xl font-bold tabular-nums ${
            candidate.score >= 5 ? "text-brand-primary" :
            candidate.score >= 0 ? "text-blue-700" :
                                   "text-amber-700"
          }`}>
            {candidate.score}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">fit</p>
        </div>
      </div>
    </button>
  );
}

function LoadingRows() {
  return (
    <div className="py-6 text-center text-sm text-slate-500">
      <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
      Scoring fleet for this window...
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 text-center">
      {message}
    </div>
  );
}
