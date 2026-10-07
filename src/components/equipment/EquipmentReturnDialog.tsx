/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * "Equipment back at base" count, shown when a driver (collection trip) or
 * a waiter (waiter-run job) brings an order's equipment back.
 *
 * Every booked item is counted: "Came back" starts at the booked quantity
 * and the person corrects it to what is physically there. Anything not
 * counted back is recorded as missing (lost) automatically - nobody has to
 * remember to report it - and damaged units among those that came back are
 * entered separately. The result goes to
 * equipmentReturnService.returnOrderEquipment via onConfirm.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, PackageCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ReturnDamage } from "@/services/equipmentReturnService";
import { countsToDamages, returnCountInt as toInt } from "@/lib/equipmentReturn";

interface Line {
  equipmentId: string;
  name: string;
  booked: number;
  unitCost: number;
  /** Counted back (string while typing). */
  back: string;
  damaged: string;
  damageType: "damaged" | "broken";
  note: string;
}

export function EquipmentReturnDialog({
  open, onOpenChange, orderId, orderLabel, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderLabel?: string;
  /** Called with missing + damaged records (empty = everything back fine). */
  onConfirm: (damages: ReturnDamage[]) => Promise<void>;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from("equipment_bookings")
        .select("equipment_id, quantity, status, equipment:equipment_id(name, replacement_cost, purchase_cost)")
        .eq("order_id", orderId)
        .neq("status", "cancelled");
      if (cancelled) return;
      if (err) setError("Couldn't load the equipment list. Close and try again.");
      const byEquipment = new Map<string, Line>();
      for (const b of (data || []) as any[]) {
        if (!b.equipment_id || b.status === "returned") continue;
        const qty = Math.max(0, Number(b.quantity || 0));
        const prev = byEquipment.get(b.equipment_id);
        if (prev) { prev.booked += qty; prev.back = String(prev.booked); continue; }
        byEquipment.set(b.equipment_id, {
          equipmentId: b.equipment_id,
          name: b.equipment?.name || "Equipment",
          booked: qty,
          unitCost: Number(b.equipment?.replacement_cost ?? b.equipment?.purchase_cost ?? 0) || 0,
          back: String(qty),
          damaged: "",
          damageType: "damaged",
          note: "",
        });
      }
      setLines(Array.from(byEquipment.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, orderId]);

  const update = (id: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.equipmentId === id ? { ...l, ...patch } : l)));

  const totals = useMemo(() => {
    let booked = 0, back = 0, damaged = 0;
    for (const l of lines) {
      const b = toInt(l.back, l.booked);
      booked += l.booked;
      back += b;
      damaged += toInt(l.damaged, b);
    }
    return { booked, back, missing: booked - back, damaged };
  }, [lines]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(countsToDamages(lines));
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const problems = totals.missing + totals.damaged;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-brand-primary" />
            Count the equipment back
          </DialogTitle>
          <DialogDescription>
            {orderLabel ? `${orderLabel}: ` : ""}count what is physically back. Anything not counted back is recorded as
            missing against this job; enter damaged items separately.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading equipment...
          </div>
        ) : lines.length === 0 ? (
          <p className="text-sm text-slate-600 py-2">Nothing is still out on this order.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => {
              const back = toInt(l.back, l.booked);
              const missing = l.booked - back;
              const damaged = toInt(l.damaged, back);
              const flagged = missing > 0 || damaged > 0;
              return (
                <div key={l.equipmentId} className={`rounded-md border p-2 ${flagged ? "border-amber-300 bg-amber-50/60" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-800">{l.name}</span>
                    <span className="text-xs text-slate-500 tabular-nums">Booked {l.booked}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 items-end">
                    <label className="text-[11px] text-slate-600">
                      Came back
                      <Input
                        type="number" min={0} max={l.booked} inputMode="numeric"
                        value={l.back}
                        onChange={(e) => update(l.equipmentId, { back: e.target.value })}
                        className="h-8 text-sm mt-0.5"
                      />
                    </label>
                    <label className="text-[11px] text-slate-600">
                      Of those, damaged
                      <Input
                        type="number" min={0} max={back} inputMode="numeric" placeholder="0"
                        value={l.damaged}
                        onChange={(e) => update(l.equipmentId, { damaged: e.target.value })}
                        className="h-8 text-sm mt-0.5"
                      />
                    </label>
                    <select
                      value={l.damageType}
                      onChange={(e) => update(l.equipmentId, { damageType: e.target.value as Line["damageType"] })}
                      aria-label={`${l.name}: damage type`}
                      disabled={damaged === 0}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm disabled:opacity-50"
                    >
                      <option value="damaged">Damaged</option>
                      <option value="broken">Broken</option>
                    </select>
                  </div>
                  {missing > 0 && (
                    <p className="mt-1 text-[11px] font-medium text-amber-800">{missing} missing - will be recorded as not returned.</p>
                  )}
                  {flagged && (
                    <Input
                      placeholder="What happened? (optional)"
                      value={l.note}
                      onChange={(e) => update(l.equipmentId, { note: e.target.value })}
                      className="h-8 text-sm mt-1.5"
                    />
                  )}
                </div>
              );
            })}
            <p className={`text-xs font-medium ${problems ? "text-amber-800" : "text-emerald-700"}`}>
              {totals.back} of {totals.booked} back
              {totals.missing > 0 ? ` · ${totals.missing} missing` : ""}
              {totals.damaged > 0 ? ` · ${totals.damaged} damaged` : ""}
              {!problems ? " · nothing missing or damaged" : ""}
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-700 flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
          </p>
        )}

        <DialogFooter>
          <Button
            onClick={submit}
            disabled={saving || loading}
            className={problems ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-brand-primary hover:bg-brand-primary/90"}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {problems ? `Confirm - ${totals.missing} missing, ${totals.damaged} damaged` : "Confirm - everything is back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
