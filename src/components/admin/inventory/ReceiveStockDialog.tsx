import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Package, AlertCircle, ScanBarcode } from "lucide-react";
import { inventoryService } from "@/services/inventoryService";
import { toLocalISO } from "@/lib/localDate";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useToast } from "@/hooks/use-toast";

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
  // Wave 24: tenant currency on the line-total preview.
  const tenantCurrency = useTenantCurrency(companyId);
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplier_name: string }>>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => toLocalISO(new Date()));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // INV-B (inventory deferred, 2026-05-24): barcode scan input.
  // USB / Bluetooth scanners type the code + ENTER into the focused
  // field, so we listen for Enter on this input and look up the
  // matching item. Falls back to manual typing for slow days where
  // the scanner battery is dead.
  const [barcode, setBarcode] = useState("");
  const [scanLooking, setScanLooking] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

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

  // INV-B: barcode scan -> preselect the matching item on the
  // first empty line. If every line already has an item, append
  // a new line and stamp it.
  const handleBarcodeSubmit = async () => {
    const code = barcode.trim();
    if (!code || !companyId) return;
    setScanLooking(true);
    try {
      const match = await inventoryService.findItemByBarcode(companyId, code);
      if (!match) {
        toast({
          title: "No item matched",
          description: `Barcode "${code}" isn't on any inventory item. Set it via Edit item -> Barcode.`,
          variant: "destructive",
        });
        return;
      }
      const opt = inventoryOptions.find((o) => o.id === match.id);
      if (!opt) {
        toast({
          title: "Item not loaded",
          description: "Refresh inventory and try again.",
          variant: "destructive",
        });
        return;
      }
      setLines((ls) => {
        const emptyIdx = ls.findIndex((l) => !l.itemId);
        if (emptyIdx === -1) {
          const fresh = newLine();
          fresh.itemId = opt.id;
          fresh.itemName = opt.name;
          fresh.unit = opt.unit;
          fresh.unitCost = String(opt.costPerUnit);
          return [...ls, fresh];
        }
        const next = [...ls];
        next[emptyIdx] = {
          ...next[emptyIdx],
          itemId: opt.id,
          itemName: opt.name,
          unit: opt.unit,
          unitCost: next[emptyIdx].unitCost || String(opt.costPerUnit),
        };
        return next;
      });
      toast({ title: "Scanned", description: opt.name });
      setBarcode("");
      // Re-focus so the operator can scan the next item without
      // moving their hand from the scanner.
      barcodeRef.current?.focus();
    } finally {
      setScanLooking(false);
    }
  };

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
            <Package className="w-5 h-5 text-brand-primary" />
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
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
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

          {/* INV-B: barcode scan input. USB / Bluetooth scanners type
              the code + ENTER, so the input fires on Enter. Falls
              back to manual typing if the scanner is offline. */}
          <div className="rounded-md border border-brand-primary/20 bg-brand-primary/10 p-3">
            <Label htmlFor="barcode" className="text-xs uppercase tracking-wide text-brand-primary">
              Scan barcode
            </Label>
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-brand-primary" />
                <Input
                  ref={barcodeRef}
                  id="barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleBarcodeSubmit();
                    }
                  }}
                  placeholder="Point the scanner here, or type a code and press Enter"
                  className="pl-8"
                  disabled={scanLooking}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleBarcodeSubmit}
                disabled={!barcode.trim() || scanLooking}
                className="gap-1.5"
              >
                <ScanBarcode className="w-4 h-4" />
                Find
              </Button>
            </div>
            <p className="text-[11px] text-brand-primary/70 mt-1">
              Scans land on the first empty line. Already-filled lines aren't overwritten.
            </p>
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
                      className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
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
                      className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
                      {tenantCurrency.format(subtotal)}
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
            disabled={saving || validLineCount === 0}
            className="bg-brand-primary hover:bg-brand-primary/90"
          >
            {saving ? "Saving..." : `Receive ${validLineCount} line${validLineCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
