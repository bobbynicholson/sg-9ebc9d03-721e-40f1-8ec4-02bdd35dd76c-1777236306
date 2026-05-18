import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { InventoryItemFormData, Supplier } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  formData: InventoryItemFormData;
  setFormData: (data: InventoryItemFormData) => void;
  onSubmit: () => void;
}

/**
 * Add-inventory-item dialog. Pure presentation - the parent owns
 * formData + the submit handler. Trigger button is rendered inline
 * via DialogTrigger so callers don't need a separate render slot.
 *
 * Extracted from the admin/inventory-tracking page in the P2-13 audit
 * split. Behaviour is byte-for-byte the same as the inlined version.
 */
export function AddInventoryItemDialog({
  open,
  onOpenChange,
  suppliers,
  formData,
  setFormData,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
          <DialogDescription>Add a new item to track in your inventory</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <Label>Item Name</Label>
            <Input
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              placeholder="e.g., Tomatoes"
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="produce">Produce</SelectItem>
                <SelectItem value="meat">Meat</SelectItem>
                <SelectItem value="dairy">Dairy</SelectItem>
                <SelectItem value="dry_goods">Dry Goods</SelectItem>
                <SelectItem value="beverages">Beverages</SelectItem>
                <SelectItem value="condiments">Condiments</SelectItem>
                <SelectItem value="supplies">Supplies</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Current Stock</Label>
            <Input
              type="number"
              value={formData.current_stock}
              onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select
              value={formData.unit_of_measure}
              onValueChange={(value) => setFormData({ ...formData, unit_of_measure: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">Kilograms (kg)</SelectItem>
                <SelectItem value="g">Grams (g)</SelectItem>
                <SelectItem value="l">Liters (L)</SelectItem>
                <SelectItem value="ml">Milliliters (ml)</SelectItem>
                <SelectItem value="units">Units</SelectItem>
                <SelectItem value="boxes">Boxes</SelectItem>
                <SelectItem value="packs">Packs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Minimum Stock Level</Label>
            <Input
              type="number"
              value={formData.minimum_stock}
              onChange={(e) => setFormData({ ...formData, minimum_stock: parseFloat(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Maximum Stock Level</Label>
            <Input
              type="number"
              value={formData.maximum_stock}
              onChange={(e) => setFormData({ ...formData, maximum_stock: parseFloat(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Cost Per Unit</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.cost_per_unit}
              onChange={(e) => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select
              value={formData.preferred_supplier_id}
              onValueChange={(value) => setFormData({ ...formData, preferred_supplier_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.supplier_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Add Item</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
