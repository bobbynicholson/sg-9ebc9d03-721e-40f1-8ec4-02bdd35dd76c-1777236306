import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/portalTime";
import type { DispatchSuggestion } from "@/services/dispatchService";

export interface ScheduleConflictChoice {
  driverName: string;
  orderNumber: string;
  eventTime: string;
}

/** Best drivers to offer instead: no nearby job, highest score first. */
export function freeDriverAlternatives(suggestions: DispatchSuggestion[], excludeDriverId: string, max = 3): DispatchSuggestion[] {
  return suggestions
    .filter((s) => s.driver.id !== excludeDriverId && !s.scheduleConflict)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, max);
}

/**
 * Asked when the dispatcher picks a driver who already has a job close to
 * this one. Two nearby events can share a driver, so this is a question,
 * not a hard stop: assign them to both jobs, or pick a free driver right
 * here (the best free drivers are listed) without going back to the list.
 */
export function ScheduleConflictConfirm({
  choice,
  alternatives = [],
  onAssignAnyway,
  onPickAlternative,
  onChooseAnother,
}: {
  choice: ScheduleConflictChoice | null;
  alternatives?: DispatchSuggestion[];
  onAssignAnyway: () => void;
  onPickAlternative?: (driverId: string) => void;
  onChooseAnother: () => void;
}) {
  const time = choice ? formatClock(choice.eventTime) : "";
  return (
    <AlertDialog open={!!choice} onOpenChange={(open) => { if (!open) onChooseAnother(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{choice?.driverName} already has a job at {time}</AlertDialogTitle>
          <AlertDialogDescription>
            {choice?.driverName} is assigned to <strong>{choice?.orderNumber}</strong> at {time}.
            If the two events are close together and one driver can cover both, assign them anyway.
            Otherwise pick a free driver below.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {onPickAlternative && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Free at this time</p>
            {alternatives.length ? alternatives.map((s) => (
              <div key={s.driver.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{s.driver.full_name}</p>
                  <p className="truncate text-xs text-slate-600">Score {s.score.total}{s.score.reasons?.length ? ` · ${s.score.reasons.slice(0, 2).join(" · ")}` : ""}</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => onPickAlternative(s.driver.id)}>
                  Assign {s.driver.full_name?.split(" ")[0] || "driver"}
                </Button>
              </div>
            )) : (
              <p className="text-sm text-slate-600">No other driver is free at this time.</p>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onChooseAnother}>Back to the full list</AlertDialogCancel>
          <AlertDialogAction onClick={onAssignAnyway}>Assign {choice?.driverName} to both jobs</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
