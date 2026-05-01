/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * /admin/tax-purchases -- log slips, mark deductible items, total
 * up the deductible bucket for the accountant.
 *
 * Not an accounting tool. The point is the catering owner can stop
 * shoving slips into a shoebox: they snap a photo at the till,
 * tap each line, and at month-end export a CSV their accountant
 * sorts. We keep the slip image so the accountant has the source
 * document if SARS asks for it.
 *
 * Page surfaces:
 *   - Header strip: receipt count + deductible total + non-deductible
 *     total over the selected window. Plus a 'X slips need lines'
 *     amber chip when there are unfiled receipts so the owner sees
 *     the back-log.
 *   - Window picker: This month / Quarter / Year / All time.
 *   - 'Add slip' button -> dialog: pick image, type vendor + total
 *     + date + notes -> creates the receipt row, slip image lives
 *     in Supabase storage. Items are added on the row's expand.
 *   - List of receipts with thumb, vendor, date, totals. Click a
 *     row to expand the item editor.
 *   - 'Export CSV' button on the header strip dumps the visible
 *     range as a CSV the accountant can drop into Excel.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Receipt, Upload, Plus, Trash2, Download, AlertCircle,
  CheckCircle2, FileText, Loader2, Camera, ChevronDown, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  uploadReceiptImage,
  createReceipt,
  updateReceipt,
  softDeleteReceipt,
  addItem,
  updateItem,
  deleteItem,
  listForCompany,
  summarise,
  buildCsvExport,
  type ReceiptWithItems,
} from "@/services/taxPurchaseService";

const fmtR = (v?: number | null) =>
  v == null ? "—" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type WindowKind = "this_month" | "this_quarter" | "this_year" | "all";

function dateRangeFor(window: WindowKind): { from?: string; to?: string } {
  const now = new Date();
  if (window === "all") return {};
  if (window === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString().slice(0, 10) };
  }
  if (window === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    return { from: from.toISOString().slice(0, 10) };
  }
  // this_year
  const from = new Date(now.getFullYear(), 0, 1);
  return { from: from.toISOString().slice(0, 10) };
}

function TaxPurchasesPage() {
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const companyId = profile?.company_id ?? user?.company_id ?? null;

  const [receipts, setReceipts] = useState<ReceiptWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowKind, setWindowKind] = useState<WindowKind>("this_month");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Add slip dialog
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVendor, setNewVendor] = useState("");
  const [newDate, setNewDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [newTotal, setNewTotal] = useState<string>("");
  const [newNotes, setNewNotes] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const range = dateRangeFor(windowKind);
      const list = await listForCompany({ companyId, fromDate: range.from, toDate: range.to });
      setReceipts(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [companyId, windowKind]);

  const summary = useMemo(() => summarise(receipts), [receipts]);

  const handleAddSlip = async () => {
    if (!companyId || !user?.id) return;
    setAdding(true);
    try {
      let imagePath: string | null = null;
      let imageUrl: string | null = null;
      if (newFile) {
        const up = await uploadReceiptImage({ companyId, file: newFile });
        if (up) {
          imagePath = up.path;
          imageUrl = up.url;
        }
      }
      const created = await createReceipt({
        companyId,
        uploadedBy: user.id,
        vendor: newVendor.trim() || null,
        receiptDate: newDate || null,
        total: newTotal ? Number(newTotal) : null,
        notes: newNotes.trim() || null,
        imagePath,
        imageUrl,
      });
      if (!created) {
        toast({ title: "Couldn't save slip", variant: "destructive" });
        return;
      }
      toast({
        title: "Slip added",
        description: imagePath
          ? "Image uploaded. Tap the row to add line items and mark deductibles."
          : "Tap the row to add line items.",
      });
      setAddOpen(false);
      setNewVendor("");
      setNewDate(new Date().toISOString().slice(0, 10));
      setNewTotal("");
      setNewNotes("");
      setNewFile(null);
      // Auto-expand the new row so the operator can immediately add lines.
      setExpanded((prev) => new Set([...prev, created.id]));
      await reload();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleExportCsv = () => {
    if (receipts.length === 0) {
      toast({ title: "Nothing to export", description: "No receipts in this window yet." });
      return;
    }
    const csv = buildCsvExport(receipts);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-purchases-${windowKind}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Tax-Deductible Purchases | Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100">
        <div className="overflow-x-hidden lg:pl-72 xl:pl-80">
          <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 pb-24 max-w-screen-2xl">

            {/* HEADER */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                      <Receipt className="w-6 h-6 text-white" />
                    </div>
                    Tax-deductible purchases
                  </h1>
                  <p className="text-slate-600 max-w-2xl text-sm">
                    Snap a slip, tap each line, mark what's deductible. One place to keep the source documents your accountant needs at year-end. Not an accounting tool, just clean numbers and the photos to back them up.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5" disabled={receipts.length === 0}>
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                  <Button onClick={() => setAddOpen(true)} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
                    <Camera className="w-4 h-4" />
                    Add slip
                  </Button>
                </div>
              </div>
            </div>

            {/* SUMMARY STRIP */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="py-4 px-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Slips logged</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{summary.receiptCount}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100">
                <CardContent className="py-4 px-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Deductible total</p>
                  <p className="text-2xl font-bold text-emerald-900 mt-1 tabular-nums">{fmtR(summary.deductibleTotal)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="py-4 px-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Non-deductible</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{fmtR(summary.nonDeductibleTotal)}</p>
                </CardContent>
              </Card>
              <Card className={`border-0 shadow-sm ${summary.unfiledCount > 0 ? "bg-amber-50" : ""}`}>
                <CardContent className="py-4 px-4">
                  <p className={`text-xs uppercase tracking-wide font-semibold ${summary.unfiledCount > 0 ? "text-amber-700" : "text-slate-500"}`}>
                    Slips needing lines
                  </p>
                  <p className={`text-2xl font-bold mt-1 tabular-nums ${summary.unfiledCount > 0 ? "text-amber-900" : "text-slate-900"}`}>
                    {summary.unfiledCount}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* WINDOW PICKER */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Window</span>
                <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
                  {([
                    { id: "this_month",   label: "This month" },
                    { id: "this_quarter", label: "This quarter" },
                    { id: "this_year",    label: "This year" },
                    { id: "all",          label: "All time" },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWindowKind(t.id)}
                      className={`px-3 py-1.5 rounded-md ${
                        windowKind === t.id
                          ? "bg-amber-600 text-white font-medium"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* RECEIPT LIST */}
            {loading ? (
              <div className="text-center py-16 text-slate-500">Loading…</div>
            ) : receipts.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-16 text-center space-y-3">
                  <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
                  <h2 className="text-base font-semibold text-slate-900">No slips in this window yet</h2>
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    Snap a photo at the till next time you shop. Tap each line, mark what's deductible. The numbers add up automatically.
                  </p>
                  <Button onClick={() => setAddOpen(true)} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
                    <Camera className="w-4 h-4" />
                    Add your first slip
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {receipts.map((r) => (
                  <ReceiptRow
                    key={r.id}
                    receipt={r}
                    expanded={expanded.has(r.id)}
                    onToggle={() => toggleExpand(r.id)}
                    onChanged={reload}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:pl-72 xl:pl-80">
          <Footer />
        </div>
      </div>

      {/* ADD SLIP DIALOG */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-600" />
              Add slip
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Slip photo</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                className="block w-full mt-1 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Phone camera works. We store the image so the accountant can refer back to it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Vendor</label>
                <Input value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder="e.g. Makro" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Date</label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Total on the slip (optional)</label>
              <Input
                type="number"
                step="0.01"
                value={newTotal}
                onChange={(e) => setNewTotal(e.target.value)}
                placeholder="e.g. 1245.50"
                className="mt-1"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Use the slip's grand total. Per-line items get added on the next step so you can mark each one deductible.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Notes</label>
              <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="e.g. Stock for Smith braai" className="mt-1" />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={adding}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleAddSlip} disabled={adding} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {adding ? "Saving…" : "Save slip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Per-row expand: line items + deductibility toggles ────────────

function ReceiptRow({
  receipt, expanded, onToggle, onChanged,
}: {
  receipt: ReceiptWithItems;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDeductible, setNewDeductible] = useState(true);

  const handleAddItem = async () => {
    if (!newDesc.trim() || !newAmount) {
      toast({ title: "Description and amount are required.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await addItem({
        receiptId: receipt.id,
        description: newDesc.trim(),
        amount: Number(newAmount),
        isDeductible: newDeductible,
      });
      setNewDesc("");
      setNewAmount("");
      setNewDeductible(true);
      await onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't add line", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDeductible = async (itemId: string, next: boolean) => {
    try {
      await updateItem({ itemId, isDeductible: next });
      await onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't update", description: err?.message, variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Remove this line?")) return;
    try {
      await deleteItem(itemId);
      await onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't delete", description: err?.message, variant: "destructive" });
    }
  };

  const handleDeleteSlip = async () => {
    if (!confirm("Delete this slip and all its lines?")) return;
    try {
      await softDeleteReceipt(receipt.id);
      await onChanged();
    } catch (err: any) {
      toast({ title: "Couldn't delete", description: err?.message, variant: "destructive" });
    }
  };

  const itemsTotal = receipt.deductibleTotal + receipt.nonDeductibleTotal;
  const slipTotal = Number(receipt.total ?? 0);
  const drift = slipTotal > 0 ? Math.abs(itemsTotal - slipTotal) : 0;
  const driftBig = drift > slipTotal * 0.05 && drift > 1; // > 5% AND > R1

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-3 px-4">
        <button
          type="button"
          className="w-full flex items-center gap-3 text-left"
          onClick={onToggle}
        >
          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          {receipt.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receipt.image_url}
              alt="Slip"
              className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-slate-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900">
                {receipt.vendor || "Untitled vendor"}
              </p>
              {receipt.receipt_date && (
                <span className="text-xs text-slate-500">
                  {new Date(receipt.receipt_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
              {receipt.items.length === 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] gap-1">
                  <AlertCircle className="w-3 h-3" /> No lines yet
                </Badge>
              )}
              {driftBig && (
                <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px]" title={`Slip total ${fmtR(slipTotal)} vs sum of lines ${fmtR(itemsTotal)}`}>
                  Lines don't match slip total
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600 mt-0.5">
              {receipt.total != null && (
                <span>Slip total: <span className="font-medium text-slate-900">{fmtR(receipt.total)}</span></span>
              )}
              <span className="text-emerald-700">
                Deductible: <span className="font-medium">{fmtR(receipt.deductibleTotal)}</span>
              </span>
              {receipt.nonDeductibleTotal > 0 && (
                <span className="text-slate-500">
                  Non-deductible: <span className="font-medium">{fmtR(receipt.nonDeductibleTotal)}</span>
                </span>
              )}
            </div>
          </div>
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
            {receipt.items.length > 0 && (
              <div className="space-y-1.5">
                {receipt.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 truncate">{it.description}</p>
                      {it.notes && <p className="text-[11px] text-slate-500 truncate">{it.notes}</p>}
                    </div>
                    <span className="tabular-nums text-slate-700 shrink-0 w-24 text-right">{fmtR(it.amount)}</span>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0">
                      <Switch
                        checked={it.is_deductible}
                        onCheckedChange={(v: boolean) => handleToggleDeductible(it.id, v)}
                      />
                      <span className={it.is_deductible ? "text-emerald-700 font-medium" : "text-slate-500"}>
                        {it.is_deductible ? "Deductible" : "Skip"}
                      </span>
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(it.id)} className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new line */}
            <div className="grid grid-cols-[1fr_120px_auto_auto] gap-2 items-center">
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Line description (e.g. 50kg lamb)"
                className="text-sm"
              />
              <Input
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="Amount"
                className="text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Switch checked={newDeductible} onCheckedChange={setNewDeductible} />
                <span className={newDeductible ? "text-emerald-700 font-medium" : "text-slate-500"}>
                  {newDeductible ? "Deductible" : "Skip"}
                </span>
              </label>
              <Button size="sm" onClick={handleAddItem} disabled={busy} className="gap-1 bg-amber-600 hover:bg-amber-700">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {receipt.image_url ? (
                <a href={receipt.image_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline">
                  View slip image
                </a>
              ) : <span />}
              <Button variant="ghost" size="sm" onClick={handleDeleteSlip} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Delete slip
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProtectedTaxPurchasesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <TaxPurchasesPage />
    </ProtectedRoute>
  );
}
