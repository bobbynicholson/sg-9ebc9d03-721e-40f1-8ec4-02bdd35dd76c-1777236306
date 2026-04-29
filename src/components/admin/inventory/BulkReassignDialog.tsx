import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Truck, Tag, AlertCircle } from "lucide-react";
import { inventoryService } from "@/services/inventoryService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "supplier" | "category";
  itemIds: string[];
  itemNames: string[];
  companyId: string | null;
  categories: string[];
  onSaved: (mode: "supplier" | "category", count: number, label: string) => void;
}

export function BulkReassignDialog({
  open,
  onOpenChange,
  mode,
  itemIds,
  itemNames,
  companyId,
  categories,
  onSaved,
}: Props) {
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplier_name: string }>>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [category, setCategory] = useState<string>(categories[0] ?? "Other");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "supplier") {
      setSupplierId("");
      if (companyId) inventoryService.getSuppliersForCompany(companyId).then(setSuppliers);
    } else {
      setCategory(categories[0] ?? "Other");
    }
  }, [open, mode, companyId, categories]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      if (mode === "supplier") {
        const result = await inventoryService.bulkReassignSupplier(itemIds, supplierId || null);
        if (result.errors.length > 0) {
          setError(result.errors.join("; "));
          if (result.updated === 0) return;
        }
        const label = supplierId
          ? suppliers.find(s => s.id === supplierId)?.supplier_name ?? "supplier"
          : "no supplier";
        onSaved("supplier", result.updated, label);
      } else {
        const result = await inventoryService.bulkReassignCategory(itemIds, category);
        if (result.errors.length > 0) {
          setError(result.errors.join("; "));
          if (result.updated === 0) return;
        }
        onSaved("category", result.updated, category);
      }
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not save the change.");
    } finally {
      setSaving(false);
    }
  };

  const previewNames = itemNames.slice(0, 4);
  const remaining = Math.max(0, itemNames.length - previewNames.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "supplier" ? (
              <>
                <Truck className="w-5 h-5 text-blue-600" />
                Reassign supplier
              </>
            ) : (
              <>
                <Tag className="w-5 h-5 text-blue-600" />
                Recategorise items
              </>
            )}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Applies to {itemIds.length} selected item{itemIds.length === 1 ? "" : "s"}.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
            <p className="font-medium mb-1">Selected items:</p>
            <p className="text-slate-600">
              {previewNames.join(", ")}
              {remaining > 0 && <span className="text-slate-500"> + {remaining} more</span>}
            </p>
          </div>

          {mode === "supplier" ? (
            <div>
              <Label htmlFor="bulk_supplier">New supplier</Label>
              <select
                id="bulk_supplier"
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No supplier</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.supplier_name}</option>
                ))}
              </select>
              {suppliers.length === 0 && (
                <p className="text-xs text-slate-500 mt-1.5">
                  No suppliers configured yet. Pick "No supplier" to clear, or add suppliers first.
                </p>
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="bulk_category">New category</Label>
              <select
                id="bulk_category"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving..." : `Apply to ${itemIds.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
