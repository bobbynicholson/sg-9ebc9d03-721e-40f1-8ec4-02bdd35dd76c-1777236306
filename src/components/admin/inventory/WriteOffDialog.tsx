import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertCircle } from "lucide-react";
import { inventoryService } from "@/services/inventoryService";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

export interface WriteOffItem {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  costPerUnit: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  performedBy: string;
  items: WriteOffItem[];
  /** If set, the dialog opens with this item pre-selected and the picker hidden. */
  preSelectedItemId?: string | null;
  /** Wave 24: tenant company id so cost-per-unit + cost-impact render
   *  in the tenant's currency. Falls back to "R" when omitted. */
  companyId?: string | null;
  onSaved: (itemName: string, qty: number, costImpact: number) => void;
}

const REASONS = [
  { key: "Spoilage",       helper: "Went bad before use." },
  { key: "Breakage",       helper: "Container broken or damaged in transit." },
  { key: "Quality reject", helper: "Below standard, not safe to serve." },
  { key: "Expired",        helper: "Past expiry date." },
  { key: "Theft / loss",   helper: "Missing without explanation." },
  { key: "Other",          helper: "Anything else. Use the note field." },
];

export function WriteOffDialog({ open, onOpenChange, performedBy, items, preSelectedItemId, companyId, onSaved }: Props) {
  const tenantCurrency = useTenantCurrency(companyId ?? null);
  const [itemId, setItemId] = useState<string>("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string>(REASONS[0].key);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemId(preSelectedItemId ?? "");
    setQty("");
    setReason(REASONS[0].key);
    setNotes("");
    setError("");
  }, [open, preSelectedItemId]);

  const selectedItem = useMemo(
    () => items.find(i => i.id === itemId) || null,
    [items, itemId],
  );

  const qtyNum = Number(qty);
  const validQty = qty !== "" && !isNaN(qtyNum) && qtyNum > 0;
  const costImpact = useMemo(() => {
    if (!selectedItem || !validQty) return 0;
    return Math.min(qtyNum, selectedItem.currentStock) * selectedItem.costPerUnit;
  }, [selectedItem, qtyNum, validQty]);

  const handleSave = async () => {
    if (!selectedItem) { setError("Pick an item to write off."); return; }
    if (!validQty) { setError("Enter a quantity greater than zero."); return; }

    setSaving(true);
    setError("");
    try {
      await inventoryService.writeOff({
        itemId: selectedItem.id,
        qty: qtyNum,
        reason,
        notes: notes.trim() || undefined,
        performedBy,
      });
      onSaved(selectedItem.name, qtyNum, costImpact);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not write off stock.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <Trash2 className="w-5 h-5" />
            Write off stock
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Removes stock and logs a waste reason. Cost impact is shown before you confirm.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {!preSelectedItemId && (
            <div>
              <Label htmlFor="wo_item">Item</Label>
              <select
                id="wo_item"
                value={itemId}
                onChange={e => setItemId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">Pick an item...</option>
                {items.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.name} ({opt.currentStock} {opt.unit})</option>
                ))}
              </select>
            </div>
          )}

          {selectedItem && (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
              <p className="font-medium text-slate-900">{selectedItem.name}</p>
              <p className="text-xs text-slate-500">
                On hand: {selectedItem.currentStock} {selectedItem.unit}
                {selectedItem.costPerUnit > 0 && <> · {tenantCurrency.format(selectedItem.costPerUnit)}/{selectedItem.unit}</>}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="wo_qty">Quantity to write off</Label>
            <Input
              id="wo_qty"
              type="number"
              min="0"
              step="0.01"
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder="0"
              className="mt-1"
              autoFocus={!!preSelectedItemId}
            />
            {selectedItem && validQty && qtyNum > selectedItem.currentStock && (
              <p className="text-xs text-amber-700 mt-1">
                You only have {selectedItem.currentStock} {selectedItem.unit} on hand. Stock will go to zero.
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Reason</Label>
            <div className="mt-2 space-y-1.5">
              {REASONS.map(r => (
                <label
                  key={r.key}
                  className={`flex items-start gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                    reason === r.key
                      ? "border-rose-500 bg-rose-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="writeOffReason"
                    value={r.key}
                    checked={reason === r.key}
                    onChange={() => setReason(r.key)}
                    className="mt-0.5 accent-rose-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{r.key}</p>
                    <p className="text-xs text-slate-500">{r.helper}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="wo_notes">Note (optional)</Label>
            <Input
              id="wo_notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What happened? Useful for analytics later."
              className="mt-1"
            />
          </div>

          {selectedItem && validQty && costImpact > 0 && (
            <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 flex items-center justify-between">
              <span className="text-sm bg-rose-50">Cost impact</span>
              <span className="text-base font-semibold bg-rose-50">
                {tenantCurrency.format(costImpact)}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={saving || !selectedItem || !validQty}
            variant="destructive"
          >
            {saving ? "Writing off..." : "Write off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
