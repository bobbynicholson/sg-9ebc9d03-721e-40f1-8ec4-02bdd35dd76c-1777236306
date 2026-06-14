/**
 * AddShiftTaskModal - Wave 41 Phase 3.
 *
 * Two-mode modal:
 *   - Default: pick task_type, planned minutes, billable toggle,
 *     optional notes. Saves as a staff_shift_tasks row.
 *   - When task_type='cleaning': also offer to attach equipment so
 *     the system can auto-create a linked cleaning_jobs row using
 *     the dishwasher-vs-manual decision based on
 *     equipment.dishwasher_safe + machine availability.
 *
 * Bobby's rule encoded in the default: when a kitchen staffer does
 * a cleaning task mid-shift, billable=FALSE - no extra cost. The
 * checkbox defaults FALSE for cleaning, TRUE for everything else.
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
import { AlertCircle, Check, Loader2, ListPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  createTask,
  taskChipMeta,
  type TaskType,
} from "@/services/staffShiftTasksService";
import {
  createJob,
  estimateJobMinutes,
  type CleaningMethod,
} from "@/services/cleaningJobsService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  shiftId: string;
  /** Show only the task types relevant to this team. */
  allowedTypes?: TaskType[];
  /** Default selection (e.g. 'cleaning' from cleaning-schedule). */
  defaultType?: TaskType;
  actorUserId?: string | null;
  /** Profile id of the staffer who owns this shift, so the new task
   *  pings them. Resolved by the caller (the shift row holds it). */
  assignedUserId?: string | null;
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

const ALL_TASK_TYPES: TaskType[] = [
  "kitchen",
  "cleaning",
  "delivery",
  "shopping",
  "waitering",
  "setup",
  "breakdown",
  "admin",
];

export function AddShiftTaskModal({
  open,
  onOpenChange,
  companyId,
  shiftId,
  allowedTypes,
  defaultType,
  actorUserId,
  assignedUserId,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const types = allowedTypes && allowedTypes.length > 0 ? allowedTypes : ALL_TASK_TYPES;

  const [taskType, setTaskType] = useState<TaskType>(defaultType || types[0]);
  const [plannedMinutes, setPlannedMinutes] = useState<number | "">("");
  const [billable, setBillable] = useState<boolean>(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleaning-specific extras (only loaded when task_type='cleaning').
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [machineList, setMachineList] = useState<MachineOption[]>([]);
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [createCleaningJob, setCreateCleaningJob] = useState<boolean>(true);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [loadedExtras, setLoadedExtras] = useState(false);

  // Wave 42 Tier 3: track whether the operator has touched the
  // billable toggle so the auto-snap on task_type change doesn't
  // override their explicit override.
  const [billableTouched, setBillableTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTaskType(defaultType || types[0]);
    setPlannedMinutes("");
    // Cleaning defaults to NOT extra cost (Bobby's rule). Other
    // task types default billable=TRUE.
    setBillable(defaultType === "cleaning" ? false : true);
    setBillableTouched(false);
    setNotes("");
    setEquipmentId("");
    setQuantity(1);
    setCreateCleaningJob(true);
    setError(null);
    setBusy(false);
  }, [open, defaultType, types]);

  // Snap billable when task_type changes - but only if the operator
  // hasn't already overridden the default. Otherwise their explicit
  // toggle gets clobbered every time they flip task_type.
  useEffect(() => {
    if (billableTouched) return;
    setBillable(taskType === "cleaning" ? false : true);
  }, [taskType, billableTouched]);

  // Load equipment + machines lazily once cleaning is picked.
  // Wave 42 Tier 3: gate by an explicit "loaded" sentinel rather
  // than the array lengths - otherwise a company with zero
  // equipment AND zero machines never re-fires the loader (both
  // arrays stay empty forever, so the stale guard
  // `length > 0 || length > 0` always returns).
  useEffect(() => {
    if (!open || taskType !== "cleaning" || !companyId) return;
    if (loadedExtras) return;
    setLoadingExtras(true);
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
      setLoadedExtras(true);
      setLoadingExtras(false);
    })();
  }, [open, taskType, companyId, loadedExtras]);

  // Reset the loaded sentinel when the modal closes so the next
  // open re-fetches (in case the operator added equipment in
  // another tab between opens).
  useEffect(() => {
    if (!open) setLoadedExtras(false);
  }, [open]);

  // Auto-decision: dishwasher if safe + machine present, else manual.
  const selectedEquipment = useMemo(
    () => equipmentList.find((e) => e.id === equipmentId) || null,
    [equipmentList, equipmentId],
  );
  const decidedMethod: CleaningMethod = useMemo(() => {
    if (!selectedEquipment) return "manual";
    if (selectedEquipment.dishwasher_safe === true && machineList.length > 0) {
      return "dishwasher";
    }
    return "manual";
  }, [selectedEquipment, machineList]);
  const decidedMachine = decidedMethod === "dishwasher" ? machineList[0] || null : null;

  const decidedEtaMin = useMemo(() => {
    if (!selectedEquipment) return null;
    return estimateJobMinutes({
      method: decidedMethod,
      equipment: selectedEquipment,
      quantity,
      machine: decidedMachine,
    });
  }, [selectedEquipment, decidedMethod, quantity, decidedMachine]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const taskRes = await createTask(supabase as any, {
        companyId,
        shiftId,
        taskType,
        plannedMinutes:
          plannedMinutes === "" || plannedMinutes == null ? null : Number(plannedMinutes),
        billable,
        notes,
        actorUserId,
        assignedUserId: assignedUserId ?? null,
      });
      if (!taskRes.ok) {
        setError(taskRes.error || "Could not save task");
        return;
      }

      // Optional follow-on: create a cleaning_jobs row linked back
      // to this task. Only when the operator picked equipment.
      if (taskType === "cleaning" && createCleaningJob && selectedEquipment) {
        const jobRes = await createJob(supabase as any, {
          companyId,
          equipmentId: selectedEquipment.id,
          quantity,
          method: decidedMethod,
          machineId: decidedMachine?.id || null,
          shiftTaskId: taskRes.taskId || null,
          actorUserId,
          notes: notes ? `via shift task - ${notes}` : "via shift task",
        });
        if (!jobRes.ok) {
          // Task was saved; the job-link failed. Surface but don't
          // roll back - the operator can retry the job manually.
          toast({
            title: "Task saved, cleaning job failed",
            description: jobRes.error || "Couldn't auto-create cleaning job",
            variant: "destructive",
          });
        }
      }

      const meta = taskChipMeta(taskType);
      toast({
        title: `${meta.label} task added`,
        description: billable ? undefined : "Marked as no extra cost.",
      });
      if (onCreated) onCreated();
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-slate-600" />
            Add task to shift
          </DialogTitle>
          <DialogDescription>
            One shift can hold multiple typed tasks. Mark a task as
            &ldquo;no extra cost&rdquo; if the staffer is already on shift - the labour
            falls under their existing pay envelope.
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
            <Label htmlFor="task_type">Task type</Label>
            <select
              id="task_type"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as TaskType)}
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {taskChipMeta(t).label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task_minutes">Planned minutes</Label>
              <Input
                id="task_minutes"
                type="number"
                min={0}
                value={plannedMinutes}
                onChange={(e) =>
                  setPlannedMinutes(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
                }
                className="mt-1"
                placeholder="e.g. 30"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={billable}
                  onChange={(e) => {
                    setBillable(e.target.checked);
                    setBillableTouched(true);
                  }}
                  className="rounded border-slate-300"
                />
                <span>Adds extra cost</span>
              </label>
            </div>
          </div>

          {!billable && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              No extra cost. The staffer is on shift - their pay covers this task.
            </div>
          )}

          {taskType === "cleaning" && (
            <>
              <div className="border-t border-slate-100 pt-3">
                <Label htmlFor="task_equipment">Equipment (optional)</Label>
                <select
                  id="task_equipment"
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  disabled={loadingExtras}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">-- skip / no specific equipment --</option>
                  {equipmentList.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                      {e.dishwasher_safe === true ? "  (dishwasher OK)" : ""}
                      {e.dishwasher_safe === false ? "  (hand wash only)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {selectedEquipment && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="task_qty">Quantity</Label>
                      <Input
                        id="task_qty"
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={createCleaningJob}
                          onChange={(e) => setCreateCleaningJob(e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        <span>Auto-create cleaning job</span>
                      </label>
                    </div>
                  </div>
                  <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900 space-y-0.5">
                    <div>
                      Suggested method: <strong>{decidedMethod === "dishwasher" ? "Dishwasher" : "Manual"}</strong>
                      {decidedMachine && <span> - {decidedMachine.name}</span>}
                    </div>
                    {decidedEtaMin != null && (
                      <div>
                        ETA back in inventory: <strong>{decidedEtaMin} min</strong>
                      </div>
                    )}
                    {decidedMethod === "manual" && (
                      <div className="opacity-80">
                        Manual = pulls a staffer for the duration. With billable off, this
                        still costs nothing - they were already on shift.
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          <div>
            <Label htmlFor="task_notes">Notes (optional)</Label>
            <Input
              id="task_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. setup top table linen"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-slate-700 hover:bg-slate-800">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
