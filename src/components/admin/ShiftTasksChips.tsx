/**
 * ShiftTasksChips - Wave 41 Phase 3.
 *
 * Renders task chips inline within a shift cell on the schedule
 * grids. Each chip shows the full task type so the labels are clear
 * without relying on hover.
 *
 * Clicking the chip body toggles completion (mark done / reopen) -
 * completion = actual_end set, rendered with a check + strikethrough.
 * Completing a task pings the operator who added it. The remove
 * button removes the task (with native confirm). "Add task" opens
 * the AddShiftTaskModal.
 *
 * Buttons stay compact but have a usable pointer target and visible
 * labels in both kitchen and cleaning schedules.
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
    <div className="mt-1 flex flex-wrap items-center gap-1">
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
            className={`inline-flex max-w-full items-center rounded-md border px-1.5 min-h-7 text-xs font-semibold ${meta.chip} ${
              isBusy ? "opacity-40" : ""
            } ${done ? "opacity-60" : ""}`}
          >
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onToggleComplete(t)}
              aria-label={done ? `Reopen ${meta.label} task` : `Mark ${meta.label} task done`}
              className={`inline-flex min-w-0 items-center gap-1 hover:opacity-80 disabled:cursor-wait ${done ? "line-through" : ""}`}
            >
              {done ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              <span className="truncate">{meta.label}</span>
              {!t.billable && <span className="shrink-0 opacity-70">*</span>}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRemove(t.id)}
              aria-label={`Remove ${meta.label} task`}
              title={`Remove ${meta.label} task`}
              className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-rose-100 hover:text-rose-800 disabled:cursor-wait"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onAddClick}
        className="inline-flex min-h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-dashed border-slate-300 px-2 text-xs font-medium text-slate-600 transition-colors hover:border-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
        aria-label="Add task to this shift"
      >
        <Plus className="h-3.5 w-3.5" />
        Add task
      </button>
    </div>
  );
}
