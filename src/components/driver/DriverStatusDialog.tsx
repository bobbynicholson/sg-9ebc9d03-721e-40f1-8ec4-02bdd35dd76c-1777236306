import { CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DriverConfirmationPanel } from "@/components/driver/DriverConfirmationPanel";
import { hasFreshPendingPodCapture } from "@/lib/podCaptureRecovery";

export interface DriverStatusDialogJob {
  id: string;
  order_number: string;
  client_name: string;
  event_time: string;
  venue_address: string;
}

/**
 * Status is a workflow dialog that can open the portaled POD camera dialog.
 * The outer Radix layer must stay mounted while that child owns the native
 * camera. Android returns focus through `document.body`, which otherwise
 * looks like an outside interaction and unmounts both layers.
 */
export function DriverStatusDialog({
  job,
  onClose,
}: {
  job: DriverStatusDialogJob | null;
  onClose: () => void;
}) {
  const handleOpenChange = (open: boolean) => {
    if (open || !job) return;
    // Last line of defence: even if a browser/Radix path bypasses the
    // outside-event guards, the POD marker means this close came while a
    // capture is active. Keep the panel mounted so the file change event can
    // populate its preview.
    if (hasFreshPendingPodCapture(job.id)) return;
    onClose();
  };

  return (
    <Dialog open={Boolean(job)} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg"
        data-testid="driver-status-dialog"
        // This parent contains a second, portaled Dialog. Returning from the
        // native camera produces focus/pointer-outside events against this
        // parent even though the driver is still in its child workflow.
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-brand-primary dark:text-brand-primary" />
            Status - {job?.client_name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Update delivery milestones and capture proof of delivery.
          </DialogDescription>
        </DialogHeader>
        {job && (
          <DriverConfirmationPanel
            orderId={job.id}
            orderNumber={job.order_number}
            eventTime={job.event_time}
            venueAddress={job.venue_address}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
