import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatClock } from "@/lib/portalTime";

export interface ScheduleConflictChoice {
  driverName: string;
  orderNumber: string;
  eventTime: string;
}

/**
 * Asked when the dispatcher picks a driver who already has a job close to
 * this one. Two nearby events can share a driver, so this is a question
 * ("Assign anyway" / "Choose another driver"), not a hard stop.
 */
export function ScheduleConflictConfirm({
  choice,
  onAssignAnyway,
  onChooseAnother,
}: {
  choice: ScheduleConflictChoice | null;
  onAssignAnyway: () => void;
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
            Otherwise choose another driver.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onChooseAnother}>Choose another driver</AlertDialogCancel>
          <AlertDialogAction onClick={onAssignAnyway}>Assign {choice?.driverName} to both jobs</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
