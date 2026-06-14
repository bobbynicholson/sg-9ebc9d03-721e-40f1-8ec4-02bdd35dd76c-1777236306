/**
 * ShiftTasksChips - Wave 41 Phase 3.
 *
 * Renders compact task chips inline within a shift cell on the
 * schedule grids. Each chip shows the task type's short label
 * (K/C/D/S/W/Su/Br/A) with a coloured pill. Hover shows full label
 * + duration + billable status.
 *
 * Clicking the chip body toggles completion (mark done / reopen) -
 * completion = actual_end set, rendered with a check + strikethrough.
 * Completing a task pings the operator who added it. The small X
 * removes the task (with native confirm). A "+" affordance opens the
 * AddShiftTaskModal.
 *
 * Designed for grid density - chips are pill-shaped 18px high so
 * they slot neatly under the planned/actual time row in a kitchen
 * or cleaning schedule cell without blowing out the row height.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  completeTask,
  deleteTask,
  reopenTask,
  taskChipMeta,
  type ShiftTaskRow,
} from "@/services/staffShiftTasksService";

interface Props {
  tasks: ShiftTaskRow[];
  onAddClick: () => void;
  onChanged: () => void;
  /** Current user id - lets the completion ping skip self-notify when the
   *  operator who added the task also closes it out. Optional; the admin
   *  schedule grids don't pass it. */
  actorUserId?: string | null;
}

export function ShiftTasksChips({ tasks, onAddClick, onChanged, actorUserId }: Props) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const onRemove = async (taskId: string) => {
    if (!window.confirm("Remove this task from the shift?")) return;
    setBusyId(taskId);
    const r = await deleteTask(supabase as any, taskId);
    setBusyId(null);
    if (!r.ok) {
      toast({ title: "Couldn't remove", description: r.error, variant: "destructive" });
      return;
    }
    onChanged();
  };

  const onToggleComplete = async (t: ShiftTaskRow) => {
    const done = !!t.actual_end;
    setBusyId(t.id);
    const r = done
      ? await reopenTask(supabase as any, t.id)
      : await completeTask(supabase as any, t.id, actorUserId);
    setBusyId(null);
    if (!r.ok) {
      toast({ title: "Couldn't update task", description: r.error, variant: "destructive" });
      return;
    }
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tasks.map((t) => {
        const meta = taskChipMeta(t.task_type);
        const done = !!t.actual_end;
        const tooltip = [
          meta.label,
          t.planned_minutes ? `${t.planned_minutes} min` : null,
          t.billable ? null : "no extra cost",
          done ? "done - click to reopen" : "click to mark done",
          t.notes ? `-- ${t.notes}` : null,
        ]
          .filter(Boolean)
          .join(" - ");
        const isBusy = busyId === t.id;
        return (
          <span
            key={t.id}
            title={tooltip}
            className={`inline-flex items-center rounded-full border px-1.5 h-[18px] text-[10px] font-semibold ${meta.chip} ${
              isBusy ? "opacity-40" : ""
            } ${done ? "opacity-60 line-through" : ""}`}
          >
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onToggleComplete(t)}
              className="inline-flex items-center gap-0.5 hover:opacity-80 disabled:cursor-wait"
            >
              {done ? <Check className="w-2.5 h-2.5 mr-0.5" /> : null}
              {meta.shortLabel}
              {!t.billable && <span className="ml-0.5 opacity-70">*</span>}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRemove(t.id)}
              title="Remove task"
              className="inline-flex items-center hover:opacity-80 disabled:cursor-wait"
            >
              <X className="w-2.5 h-2.5 ml-0.5 opacity-60" />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onAddClick}
        className="inline-flex items-center justify-center rounded-full border border-dashed border-slate-300 w-[18px] h-[18px] text-slate-400 hover:text-slate-700 hover:border-slate-500 transition-colors"
        title="Add task to this shift"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}
