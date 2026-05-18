/**
 * ShiftTasksChips - Wave 41 Phase 3.
 *
 * Renders compact task chips inline within a shift cell on the
 * schedule grids. Each chip shows the task type's short label
 * (K/C/D/S/W/Su/Br/A) with a coloured pill. Hover shows full label
 * + duration + billable status. Click on a chip removes it (with
 * native confirm). A "+" affordance opens the AddShiftTaskModal.
 *
 * Designed for grid density - chips are pill-shaped 18px high so
 * they slot neatly under the planned/actual time row in a kitchen
 * or cleaning schedule cell without blowing out the row height.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  deleteTask,
  taskChipMeta,
  type ShiftTaskRow,
} from "@/services/staffShiftTasksService";

interface Props {
  tasks: ShiftTaskRow[];
  onAddClick: () => void;
  onChanged: () => void;
}

export function ShiftTasksChips({ tasks, onAddClick, onChanged }: Props) {
  const { toast } = useToast();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const onRemove = async (taskId: string) => {
    if (!window.confirm("Remove this task from the shift?")) return;
    setRemovingId(taskId);
    const r = await deleteTask(supabase as any, taskId);
    setRemovingId(null);
    if (!r.ok) {
      toast({ title: "Couldn't remove", description: r.error, variant: "destructive" });
      return;
    }
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tasks.map((t) => {
        const meta = taskChipMeta(t.task_type);
        const tooltip = [
          meta.label,
          t.planned_minutes ? `${t.planned_minutes} min` : null,
          t.billable ? null : "no extra cost",
          t.notes ? `-- ${t.notes}` : null,
        ]
          .filter(Boolean)
          .join(" - ");
        const isBusy = removingId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            disabled={isBusy}
            onClick={() => onRemove(t.id)}
            title={tooltip}
            className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 h-[18px] text-[10px] font-semibold transition-opacity ${meta.chip} ${
              isBusy ? "opacity-40" : "hover:opacity-80"
            }`}
          >
            {meta.shortLabel}
            {!t.billable && <span className="ml-0.5 opacity-70">*</span>}
            <X className="w-2.5 h-2.5 ml-0.5 opacity-60" />
          </button>
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
