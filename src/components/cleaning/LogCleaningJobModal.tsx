/**
 * LogCleaningJobModal -- Wave 41 Phase 2.
 *
 * Operator-driven creation of a cleaning_jobs row. Picks:
 *   - equipment + quantity (defaults to 1)
 *   - method (dishwasher | manual | outsourced_hire)
 *   - dishwasher: optional machine_id (capacity drives ETA)
 *   - notes
 *
 * The estimated planned_end is shown live so the operator sees
 * when the gear comes back into inventory before they save.
 *
 * Auto-prefers 'dishwasher' when equipment.dishwasher_safe = TRUE,
 * else 'manual'. Operator can always override.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Check, Droplets, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  createJob,
  estimateJobMinutes,
  type CleaningMethod,
} from "@/services/cleaningJobsService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  actorUserId: string | null;
  /** Optional pre-fill when launched from another surface. */
  initialEquipmentId?: string;
  initialQuantity?: number;
  triggeredByEventId?: string | null;
  onCreated?: () => void;
}

interface EquipmentOption {
  id: string;
  name: string;
  dishwasher_safe: boolean | null;
  cleaning_time_manual_minutes: number | null;
  cleaning_time_dishwasher_minutes: number | null;
  cleaning_time_hours: number | null;
}

interface MachineOption {
  id: string;
  name: string;
  cycle_minutes: number;
  items_per_cycle: number;
}

export function LogCleaningJobModal({
  open,
  onOpenChange,
  companyId,
  actorUserId,
  initialEquipmentId,
  initialQuantity,
  triggeredByEventId,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [machineList, setMachineList] = useState<MachineOption[]>([]);
  const [equipmentId, setEquipmentId] = useState<string>(initialEquipmentId || "");
  const [quantity, setQuantity] = useState<number>(initialQuantity || 1);
  const [method, setMethod] = useState<CleaningMethod>("manual");
  const [machineId, setMachineId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Reset on open + load options.
  useEffect(() => {
    if (!open || !companyId) return;
    setEquipmentId(initialEquipmentId || "");
    setQuantity(initialQuantity || 1);
    setMethod("manual");
    setMachineId("");
    setNotes("");
    setError(null);
    setBusy(false);
    setLoadingOptions(true);

    (async () => {
      const [{ data: eq }, { data: ma }] = await Promise.all([
        (supabase as any)
          .from("equipment")
          .select(
            "id, name, dishwasher_safe, cleaning_time_manual_minutes, cleaning_time_dishwasher_minutes, cleaning_time_hours",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        (supabase as any)
          .from("cleaning_machines")
          .select("id, name, cycle_minutes, items_per_cycle")
          .eq("company_id", companyId)
          .eq("active", true)
          .is("deleted_at", null)
          .order("name", { ascending: true }),
      ]);
      setEquipmentList((eq || []) as EquipmentOption[]);
      setMachineList((ma || []) as MachineOption[]);
      setLoadingOptions(false);
    })();
  }, [open, companyId, initialEquipmentId, initialQuantity]);

  // When equipment changes, snap method to dishwasher if it's safe
  // and we have at least one active machine. Operator can override.
  const selectedEquipment = useMemo(
    () => equipmentList.find((e) => e.id === equipmentId) || null,
    [equipmentList, equipmentId],
  );
  useEffect(() => {
    if (!selectedEquipment) return;
    if (selectedEquipment.dishwasher_safe === true && machineList.length > 0) {
      setMethod("dishwasher");
      setMachineId(machineList[0].id);
    } else {
      setMethod("manual");
      setMachineId("");
    }
  }, [selectedEquipment, machineList]);

  // Live ETA preview.
  const etaMinutes = useMemo(() => {
    if (!selectedEquipment) return null;
    const machine = machineList.find((m) => m.id === machineId) || null;
    return estimateJobMinutes({
      method,
      equipment: selectedEquipment,
      quantity,
      machine,
    });
  }, [selectedEquipment, machineList, machineId, method, quantity]);

  const etaLabel = useMemo(() => {
    if (etaMinutes == null) return null;
    if (etaMinutes < 60) return `${etaMinutes} min`;
    const h = Math.floor(etaMinutes / 60);
    const m = etaMinutes % 60;
    if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }, [etaMinutes]);

  const submit = async () => {
    setError(null);
    if (!equipmentId) {
      setError("Pick the equipment first.");
      return;
    }
    if (quantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }
    if (method === "dishwasher" && machineList.length > 0 && !machineId) {
      setError("Pick which dishwasher this batch is going through.");
      return;
    }
    setBusy(true);
    const r = await createJob(supabase as any, {
      companyId,
      equipmentId,
      quantity,
      method,
      machineId: method === "dishwasher" ? machineId || null : null,
      triggeredByEventId: triggeredByEventId ?? null,
      notes,
      actorUserId,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Could not create cleaning job.");
      return;
    }
    toast({ title: "Cleaning job logged", description: etaLabel ? `Back in inventory in ${etaLabel}` : undefined });
    if (onCreated) onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-cyan-600" />
            Log cleaning job
          </DialogTitle>
          <DialogDescription>
            Tracks when this gear returns to inventory. If a staffer on shift handles
            it, no extra cost -- their shift covers the labour.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-rose-200 bg-rose-50">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <AlertDescription className="text-rose-800 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="equipment">Equipment</Label>
            <select
              id="equipment"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              disabled={loadingOptions}
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="">{loadingOptions ? "Loading..." : "-- pick equipment --"}</option>
              {equipmentList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.dishwasher_safe === true ? "  (dishwasher OK)" : ""}
                  {e.dishwasher_safe === false ? "  (hand wash only)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as CleaningMethod)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              >
                <option value="dishwasher" disabled={machineList.length === 0}>
                  Dishwasher{machineList.length === 0 ? " (no machines)" : ""}
                </option>
                <option value="manual">Manual</option>
                <option value="outsourced_hire">Outsourced hire</option>
              </select>
            </div>
          </div>

          {method === "dishwasher" && machineList.length > 0 && (
            <div>
              <Label htmlFor="machine">Machine</Label>
              <select
                id="machine"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              >
                <option value="">-- pick machine --</option>
                {machineList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.cycle_minutes}m / {m.items_per_cycle} items)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. greasy from spit braai, soak first"
              className="mt-1"
            />
          </div>

          {etaLabel && (
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
              ETA back in inventory: <strong>{etaLabel}</strong>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !equipmentId}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Log job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
