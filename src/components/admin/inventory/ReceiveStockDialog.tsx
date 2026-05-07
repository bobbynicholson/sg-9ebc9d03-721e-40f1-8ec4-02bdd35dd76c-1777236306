import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Package, AlertCircle } from "lucide-react";
import { inventoryService } from "@/services/inventoryService";
import { toLocalISO } from "@/lib/localDate";

export interface ReceiveLine {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  qty: string;
  unitCost: string;
  batchNumber: string;
  expiryDate: string;
}

export interface InventoryOption {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  performedBy: string;
  inventoryOptions: InventoryOption[];
  onSaved: (received: number, invoiceNumber: string) => void;
}

const newLine = (): ReceiveLine => ({
  id: Math.random().toString(36).slice(2, 9),
  itemId: "",
  itemName: "",
  unit: "",
  qty: "",
  unitCost: "",
  batchNumber: "",
  expiryDate: "",
});

export function ReceiveStockDialog({ open, onOpenChange, companyId, performedBy, inventoryOptions, onSaved }: Props) {
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplier_name: string }>>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => toLocalISO(new Date()));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load suppliers when modal opens
  useEffect(() => {
    if (!open || !companyId) return;
    inventoryService.getSuppliersForCompany(companyId).then(setSuppliers);
    // Reset form on open
    setSupplierId("");
    setInvoiceNumber("");
    setReceivedDate(toLocalISO(new Date()));
    setNotes("");
    setLines([newLine()]);
    setError("");
  }, [open, companyId]);

  const handleItemPick = (lineId: string, itemId: string) => {
    const item = inventoryOptions.find(i => i.id === itemId);
    setLines(ls => ls.map(l => l.id === lineId
      ? {
          ...l,
          itemId,
          itemName: item?.name ?? "",
          unit: item?.unit ?? "",
          unitCost: l.unitCost || (item ? String(item.costPerUnit) : ""),
        }
      : l
    ));
  };

  const updateLine = (lineId: string, patch: Partial<ReceiveLine>) => {
    setLines(ls => ls.map(l => l.id === lineId ? { ...l, ...patch } : l));
  };

  const removeLine = (lineId: string) => {
    setLines(ls => ls.length === 1 ? [newLine()] : ls.filter(l => l.id !== lineId));
  };

  const addLine = () => setLines(ls => [...ls, newLine()]);

  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const q = Number(l.qty) || 0;
      const c = Number(l.unitCost) || 0;
      return sum + q * c;
    }, 0);
  }, [lines]);

  const validLineCount = useMemo(
    () => lines.filter(l => l.itemId && Number(l.qty) > 0).length,
    [lines],
  );

  const handleSave = async () => {
    if (!companyId) { setError("No company on your profile."); return; }
    const validLines = lines.filter(l => l.itemId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      setError("Add at least one line with an item and quantity.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await inventoryService.receiveStock({
        companyId,
        supplierId: supplierId || null,
        invoiceNumber: invoiceNumber.trim(),
        receivedDate,
        performedBy,
        notes: notes.trim() || undefined,
        lines: validLines.map(l => ({
          itemId: l.itemId,
          qty: Number(l.qty),
          unitCost: l.unitCost !== "" ? Number(l.unitCost) : null,
          batchNumber: l.batchNumber.trim() || undefined,
          expiryDate: l.expiryDate || undefined,
        })),
      });

      if (result.errors.length > 0) {
        setError(`Received ${result.received} of ${validLines.length} lines. Errors: ${result.errors.join("; ")}`);
        if (result.received === 0) return;
      }

      onSaved(result.received, invoiceNumber.trim());
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Could not save delivery.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            Receive stock
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Log a delivery. Adds to stock and updates the cost per unit if you enter one.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <select
                id="supplier"
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Not specified</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.supplier_name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="invoice">Invoice / reference</Label>
              <Input
                id="invoice"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="optional"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="received_date">Received on</Label>
              <Input
                id="received_date"
                type="date"
                value={receivedDate}
                onChange={e => setReceivedDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items received</Label>
              <span className="text-xs text-slate-500">
                {validLineCount} of {lines.length} line{lines.length === 1 ? "" : "s"} ready
              </span>
            </div>
            <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
              {lines.map((line, idx) => (
                <div key={line.id} className="p-3 grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-4">
                    {idx === 0 && <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Item</p>}
                    <select
                      value={line.itemId}
                      onChange={e => handleItemPick(line.id, e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Pick an item...</option>
                      {inventoryOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    {idx === 0 && <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Qty</p>}
                    <div className="flex items-baseline gap-1">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.qty}
                        onChange={e => updateLine(line.id, { qty: e.target.value })}
                        placeholder="0"
                        className="text-sm h-9"
                      />
                      {line.unit && <span className="text-xs text-slate-500 whitespace-nowrap">{line.unit}</span>}
                    </div>
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    {idx === 0 && <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Unit cost (R)</p>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      onChange={e => updateLine(line.id, { unitCost: e.target.value })}
                      placeholder="0.00"
                      className="text-sm h-9"
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    {idx === 0 && <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Batch</p>}
                    <Input
                      value={line.batchNumber}
                      onChange={e => updateLine(line.id, { batchNumber: e.target.value })}
                      placeholder="optional"
                      className="text-sm h-9"
                    />
                  </div>
                  <div className="col-span-10 md:col-span-1">
                    {idx === 0 && <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Expiry</p>}
                    <Input
                      type="date"
                      value={line.expiryDate}
                      onChange={e => updateLine(line.id, { expiryDate: e.target.value })}
                      className="text-sm h-9"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1 flex items-end justify-end">
                    {idx === 0 && <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1 invisible">.</p>}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => removeLine(line.id)}
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="p-2 bg-slate-50 flex items-center justify-between">
                <Button variant="ghost" size="sm" className="gap-2" onClick={addLine}>
                  <Plus className="w-4 h-4" />
                  Add line
                </Button>
                {subtotal > 0 && (
                  <p className="text-sm">
                    <span className="text-slate-500">Total:</span>{" "}
                    <span className="font-semibold text-slate-900">
                      R{subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="receive_notes">Notes (optional)</Label>
            <Input
              id="receive_notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this delivery"
              className="mt-1"
            />
          </div>

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
          <Button
            onClick={handleSave}
            disabled={saving || validLineCount === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Saving..." : `Receive ${validLineCount} line${validLineCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
