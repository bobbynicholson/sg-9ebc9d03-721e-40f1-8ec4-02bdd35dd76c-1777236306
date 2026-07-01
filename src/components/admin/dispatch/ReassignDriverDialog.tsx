/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { dispatchService, type DispatchSuggestion } from "@/services/dispatchService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  performedBy: string;
  order: {
    id: string;
    client_name?: string;
    event_date: string;
    event_time?: string | null;
    venue_lat?: number | null;
    venue_lng?: number | null;
    requires_refrigeration?: boolean;
    /** Branch the order belongs to. Drives default driver pool scoping. */
    region_id?: string | null;
  };
  /** When true, shows an Unassign button (for active orders that should drop off the queue). */
  allowUnassign?: boolean;
  onAssigned?: () => void;
  onUnassigned?: () => void;
}

/**
 * Shared reassign dialog. Used by Dispatch Queue + Live Operations whenever
 * a driver needs to be swapped on an order. The same suggest -> review ->
 * one-click accept flow as the initial assign dialog, with optional unassign.
 */
export function ReassignDriverDialog({
  open,
  onOpenChange,
  companyId,
  performedBy,
  order,
  allowUnassign = false,
  onAssigned,
  onUnassigned,
}: Props) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<DispatchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  // Branch lending. Default = restrict to the order's branch pool;
  // toggle off when the local pool is full / unavailable and the
  // dispatcher needs to borrow a driver from another branch.
  const [lendFromOtherBranches, setLendFromOtherBranches] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    setReason("");
    setLendFromOtherBranches(false);
    setLoading(true);
    dispatchService.suggestDriversForOrder(companyId, {
      id: order.id,
      event_date: order.event_date,
      event_time: order.event_time,
      venue_lat: order.venue_lat,
      venue_lng: order.venue_lng,
      requires_refrigeration: order.requires_refrigeration,
      region_id: order.region_id ?? null,
      // Was capped at 5, which hid the rest of the fleet - the dispatcher
      // couldn't swap to a driver outside the top few. Return the whole
      // scored list (best-first); the dialog scrolls. 200 is an
      // effectively-unlimited ceiling for any catering fleet. Matches the
      // initial-assign dialog in order-assignments.tsx.
    }, 200, { restrictToRegion: !lendFromOtherBranches }).then(setSuggestions).finally(() => setLoading(false));
  }, [open, companyId, order.id, lendFromOtherBranches]);

  const handlePick = async (driverId: string, score?: number, blocked?: boolean) => {
    if (!companyId) return;
    // Phase 3 #5: when the dispatcher picks a driver who has at
    // least one gate failure (capacity, feasibility, vehicle), make
    // them write a reason. Audit trail then has the "why" for the
    // override, not just the swap. Skipped when picking a clean
    // suggestion - the reason field is still available but optional.
    if (blocked && !reason.trim()) {
      toast({
        title: "Reason required to override gates",
        description: "This driver has at least one capacity / feasibility / vehicle gate failing. Note why you're overriding before continuing.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const r = await dispatchService.assignDriverWithGate({
        companyId,
        orderId: order.id,
        driverId,
        performedBy,
        score,
        reason: reason.trim() || (blocked ? "Reassigned (gate override)" : "Reassigned"),
      });
      if (!r.ok) {
        toast({ title: "Could not reassign", description: r.reason, variant: "destructive" });
        return;
      }
      const driverName = suggestions.find(s => s.driver.id === driverId)?.driver.full_name ?? "Driver";
      const baseDesc = `${driverName}${order.client_name ? ` on ${order.client_name}` : ""}`;
      // Phase 2 #4: surface the double-booking warning if the dispatch
      // service noticed an overlap. We let the assign land (warn-and-
      // allow) but the dispatcher needs to see it, not just the admin
      // bell.
      if (r.conflictWarning) {
        toast({
          title: "Reassigned with conflict",
          description: `${baseDesc}. ${r.conflictWarning}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Driver reassigned",
          description: r.vehicleNote ? `${baseDesc}, ${r.vehicleNote.toLowerCase()}` : baseDesc,
        });
      }
      onOpenChange(false);
      onAssigned?.();
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await dispatchService.unassignDriver({
        companyId,
        orderId: order.id,
        performedBy,
        reason: reason.trim() || "Unassigned from order",
      });
      toast({ title: "Driver removed", description: order.client_name || "" });
      onOpenChange(false);
      onUnassigned?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-primary" />
            Reassign driver{order.client_name ? ` · ${order.client_name}` : ""}
          </DialogTitle>
          <DialogDescription>
            Top matches are scored by distance, current load, branch match, vehicle fit and 30-day on-time rate. Client driver rating is shown for context only.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3">
          <Label htmlFor="reassign_reason" className="text-xs">Reason for reassign (optional)</Label>
          <Input
            id="reassign_reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Original driver running late, vehicle broken down"
            className="mt-1 text-sm"
          />
        </div>

        {/* Cross-branch lend toggle. Hidden when the order has no
            region scoping (single-branch tenants don't need it). */}
        {order.region_id && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-amber-900">Borrow from other branches</div>
              <div className="text-[11px] text-amber-800/80">
                {lendFromOtherBranches
                  ? "Showing all company drivers, including other branches."
                  : "Suggestions are limited to this branch's pool. Toggle on if no local driver fits."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLendFromOtherBranches((v) => !v)}
              className={`shrink-0 inline-flex h-6 w-10 items-center rounded-full border transition-colors ${
                lendFromOtherBranches
                  ? "bg-amber-600 border-amber-600"
                  : "bg-white border-slate-300"
              }`}
              aria-pressed={lendFromOtherBranches}
              aria-label="Toggle cross-branch driver lending"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  lendFromOtherBranches ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <div className="animate-spin w-5 h-5 border-2 border-brand-primary/80 border-t-transparent rounded-full mx-auto mb-2" />
            Scoring drivers...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No active drivers available.
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s, idx) => {
              const blocked = !s.capacity.ok || !s.feasibility.ok || !s.vehicle.ok;
              return (
                <button
                  key={s.driver.id}
                  type="button"
                  onClick={() => handlePick(s.driver.id, s.score.total, blocked)}
                  disabled={saving}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${
                    idx === 0 && !blocked
                      ? "border-brand-primary bg-brand-primary/10 hover:bg-brand-primary/15 ring-2 ring-brand-primary/20"
                      : blocked
                        ? "border-rose-200 bg-rose-50/40 hover:bg-rose-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {idx === 0 && !blocked && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide bg-brand-primary text-white px-1.5 py-0.5 rounded">
                            Top match
                          </span>
                        )}
                        <p className="text-sm font-medium text-slate-900">{s.driver.full_name}</p>
                      </div>
                      <p className="text-xs text-slate-600">
                        {s.score.reasons.slice(0, 3).join(" · ")}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {!s.capacity.ok && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
                            {s.capacity.reason}
                          </span>
                        )}
                        {!s.vehicle.ok && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
                            {s.vehicle.reason}
                          </span>
                        )}
                        {!s.feasibility.ok && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
                            {s.feasibility.reason}
                          </span>
                        )}
                        {s.feasibility.etaMinutes != null && s.feasibility.ok && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            ETA ~{s.feasibility.etaMinutes}m
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-2xl font-bold tabular-nums ${
                        s.score.total >= 75 ? "text-brand-primary" :
                        s.score.total >= 50 ? "text-blue-700" :
                                              "text-amber-700"
                      }`}>
                        {s.score.total}
                      </p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">score</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter className="mt-3">
          {allowUnassign && (
            <Button
              variant="ghost"
              onClick={handleUnassign}
              disabled={saving}
              className="text-rose-700 hover:text-rose-800 hover:bg-rose-50 mr-auto"
            >
              <X className="w-4 h-4 mr-1.5" />
              Unassign driver
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
