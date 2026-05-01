/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, X, AlertCircle } from "lucide-react";
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

  useEffect(() => {
    if (!open || !companyId) return;
    setReason("");
    setLoading(true);
    dispatchService.suggestDriversForOrder(companyId, {
      id: order.id,
      event_date: order.event_date,
      event_time: order.event_time,
      venue_lat: order.venue_lat,
      venue_lng: order.venue_lng,
      requires_refrigeration: order.requires_refrigeration,
    }, 5).then(setSuggestions).finally(() => setLoading(false));
  }, [open, companyId, order.id]);

  const handlePick = async (driverId: string, score?: number) => {
    if (!companyId) return;
    setSaving(true);
    try {
      const r = await dispatchService.assignDriverWithGate({
        companyId,
        orderId: order.id,
        driverId,
        performedBy,
        score,
        reason: reason.trim() || "Reassigned",
      });
      if (!r.ok) {
        toast({ title: "Could not reassign", description: r.reason, variant: "destructive" });
        return;
      }
      const driverName = suggestions.find(s => s.driver.id === driverId)?.driver.full_name ?? "Driver";
      const baseDesc = `${driverName}${order.client_name ? ` on ${order.client_name}` : ""}`;
      toast({
        title: "Driver reassigned",
        description: r.vehicleNote ? `${baseDesc}, ${r.vehicleNote.toLowerCase()}` : baseDesc,
      });
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
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Reassign driver{order.client_name ? ` · ${order.client_name}` : ""}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Top matches scored by distance, current load, region, on-time rate, rating.
            Capacity, vehicle and time-window gates already applied.
          </p>
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

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">
            <div className="animate-spin w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto mb-2" />
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
                  onClick={() => handlePick(s.driver.id, s.score.total)}
                  disabled={saving}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${
                    idx === 0 && !blocked
                      ? "border-emerald-500 bg-emerald-50 hover:bg-emerald-100 ring-2 ring-emerald-200"
                      : blocked
                        ? "border-red-200 bg-red-50/40 hover:bg-red-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {idx === 0 && !blocked && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide bg-emerald-600 text-white px-1.5 py-0.5 rounded">
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
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                            {s.capacity.reason}
                          </span>
                        )}
                        {!s.vehicle.ok && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                            {s.vehicle.reason}
                          </span>
                        )}
                        {!s.feasibility.ok && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
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
                        s.score.total >= 75 ? "text-emerald-700" :
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
              className="text-red-700 hover:text-red-800 hover:bg-red-50 mr-auto"
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
