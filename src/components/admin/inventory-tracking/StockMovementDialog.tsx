import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { InventoryItem, StockMovementFormData } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: InventoryItem | null;
  stockMovementData: StockMovementFormData;
  setStockMovementData: (data: StockMovementFormData) => void;
  onSubmit: () => void;
}

/**
 * Add/remove-stock dialog for an inventory item. Opens programmatically
 * (no DialogTrigger - the parent opens it when the user clicks the
 * Add or Remove button on an inventory card).
 *
 * Extracted from admin/inventory-tracking in the P2-13 audit split.
 * Behaviour is byte-for-byte the same as the inlined version.
 */
export function StockMovementDialog({
  open,
  onOpenChange,
  selectedItem,
  stockMovementData,
  setStockMovementData,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {stockMovementData.transaction_type === "purchase" ? "Add" : "Remove"} Stock
          </DialogTitle>
          <DialogDescription>Update stock for {selectedItem?.item_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label>Current Stock</Label>
            <div className="text-2xl font-bold mt-1">
              {selectedItem?.current_stock} {selectedItem?.unit_of_measure}
            </div>
          </div>
          <div className="space-y-2">
            <Label>
              Quantity to {stockMovementData.transaction_type === "purchase" ? "Add" : "Remove"}
            </Label>
            <Input
              type="number"
              value={stockMovementData.quantity}
              onChange={(e) =>
                setStockMovementData({ ...stockMovementData, quantity: parseFloat(e.target.value) || 0 })
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={stockMovementData.notes}
              onChange={(e) =>
                setStockMovementData({ ...stockMovementData, notes: e.target.value })
              }
              placeholder="e.g., Delivery received, Used for order #123"
            />
          </div>
          {selectedItem && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-sm text-slate-600">New Stock Level</div>
              <div className="text-xl font-bold mt-1">
                {stockMovementData.transaction_type === "purchase"
                  ? selectedItem.current_stock + stockMovementData.quantity
                  : selectedItem.current_stock - stockMovementData.quantity}{" "}
                {selectedItem.unit_of_measure}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Update Stock</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
