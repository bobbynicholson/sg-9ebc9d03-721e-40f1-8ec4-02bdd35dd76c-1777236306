import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { orderService } from "@/services/orderService";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceOrderId: string | null;
  /**
   * Seed value for the date input on first open. Parent typically
   * passes today + 7 days so the operator doesn't start at a blank
   * date and has a sensible default they can tweak.
   */
  defaultDate?: string;
  /** Closes the parent's order-details modal once the duplicate lands. */
  onDuplicated: () => void;
}

/**
 * "Duplicate this order" modal. Operator picks a new event date;
 * everything else (client, menu, equipment, total) carries over via
 * orderService.duplicateOrder.
 *
 * Extracted from src/pages/admin/orders.tsx in the P2-13 Phase A
 * split. The dialog now owns its own date + busy state because
 * neither was shared with anything else in the parent; the parent's
 * pre-seed (today + 7d) comes in via the `defaultDate` prop.
 */
export function DuplicateOrderDialog({
  open,
  onOpenChange,
  sourceOrderId,
  defaultDate,
  onDuplicated,
}: Props) {
  const { toast } = useToast();
  const [duplicateDate, setDuplicateDate] = useState(defaultDate || "");
  const [duplicateBusy, setDuplicateBusy] = useState(false);

  // When the dialog opens, snap the date back to whatever the parent
  // seeded for this trigger. Prevents the value carrying over from
  // a previous open (e.g. operator picks a date, cancels, comes back
  // tomorrow for a different order - they should start at the new
  // seed, not their old pick).
  useEffect(() => {
    if (open && defaultDate) {
      setDuplicateDate(defaultDate);
    }
  }, [open, defaultDate]);

  const handleDuplicate = async () => {
    if (!sourceOrderId) return;
    setDuplicateBusy(true);
    try {
      const res = await orderService.duplicateOrder(sourceOrderId, duplicateDate);
      if (!res.success) {
        toast({
          title: "Could not duplicate",
          description: (res as { success: false; error: string }).error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Order duplicated",
        description: `New order ${(res.data as any).order_number} created on ${duplicateDate}.`,
      });
      onOpenChange(false);
      onDuplicated();
    } finally {
      setDuplicateBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate this order</DialogTitle>
          <DialogDescription>
            Pick the event date for the new copy. Everything else (client, menu,
            equipment, total) carries over and you can tweak the duplicate after
            it lands.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block text-sm font-medium text-slate-700">
            New event date
            <Input
              type="date"
              value={duplicateDate}
              onChange={(e) => setDuplicateDate(e.target.value)}
              className="mt-1"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={duplicateBusy}
          >
            Cancel
          </Button>
          <Button
            disabled={
              duplicateBusy
              || !duplicateDate
              || !/^\d{4}-\d{2}-\d{2}$/.test(duplicateDate)
            }
            onClick={handleDuplicate}
          >
            {duplicateBusy ? "Duplicating..." : "Duplicate order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
