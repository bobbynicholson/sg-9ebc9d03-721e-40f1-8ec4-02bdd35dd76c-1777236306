/**
 * ReceiptsTab - the slip log and tax-deductible editor that used to
 * live on /admin/tax-purchases. Mounted as the "Receipts" tab on
 * /admin/shopping so admins act in one place.
 *
 * Owns: window picker (month/quarter/year/all), four summary cards,
 * receipt list with per-row line editor, Add-slip dialog, AI rescan,
 * soft delete, and CSV export.
 *
 * The read-only mirror at /admin/tax-purchases reads the same data
 * through the same service, just without the editing affordances.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
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
  FileText, Loader2, Camera, ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ReconcileSlipDrawer, type Extraction } from "@/components/shopping/ReconcileSlipDrawer";
import { toLocalISO } from "@/lib/localDate";
import {
  uploadReceiptImage,
  createReceipt,
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

export type WindowKind = "this_month" | "this_quarter" | "this_year" | "all";

export function dateRangeFor(window: WindowKind): { from?: string; to?: string } {
  const now = new Date();
  if (window === "all") return {};
  if (window === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toLocalISO(from) };
  }
  if (window === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    return { from: toLocalISO(from) };
  }
  const from = new Date(now.getFullYear(), 0, 1);
  return { from: toLocalISO(from) };
}

interface Props {
  companyId: string;
  userId: string;
}

export function ReceiptsTab({ companyId, userId }: Props) {
  const { toast } = useToast();
  // TAX-B (tax-purchases deferred, 2026-05-24): honour ?receipt=<id>
  // from /admin/tax-purchases's "Fix on Shopping" deep-link. We
  // auto-expand the matching row once it's loaded, and widen the
  // window to "all time" if the slip isn't in the default this-month
  // pull so it shows up.
  const router = useRouter();
  const targetReceiptId = typeof router.query.receipt === "string" ? router.query.receipt : null;

  const [receipts, setReceipts] = useState<ReceiptWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  // When the deep-link arrives, default to all-time so a slip from
  // an older period can be found. The operator can narrow after.
  const [windowKind, setWindowKind] = useState<WindowKind>(targetReceiptId ? "all" : "this_month");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const [rescanResult, setRescanResult] = useState<{ receiptId: string; mappedData: Extraction } | null>(null);
  // SHOP-J: per-receipt rescan cooldown. AI calls cost money - a
  // double-click was firing two paid Anthropic vision requests
  // against the same image. 30 second floor between rescans for
  // the same id; live rescans against different receipts are fine.
  const [lastRescanAt, setLastRescanAt] = useState<Record<string, number>>({});
  // SHOP-J: clickable "Slips needing lines" tile filter. Sets a
  // boolean filter so the operator can jump from the summary tile
  // to the list of slips needing line-by-line breakdown.
  const [needsLinesOnly, setNeedsLinesOnly] = useState(false);

  // TAX-B: auto-expand + scroll on deep-link.
  useEffect(() => {
    if (!targetReceiptId || receipts.length === 0) return;
    if (!receipts.some((r) => r.id === targetReceiptId)) return;
    setExpanded((prev) => {
      if (prev.has(targetReceiptId)) return prev;
      const next = new Set(prev);
      next.add(targetReceiptId);
      return next;
    });
    setTimeout(() => {
      const el = document.getElementById(`receipt-row-${targetReceiptId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }, [targetReceiptId, receipts]);

  const handleRescan = async (receiptId: string) => {
    // SHOP-J cooldown guard.
    const last = lastRescanAt[receiptId];
    if (last && Date.now() - last < 30_000) {
      const wait = Math.ceil((30_000 - (Date.now() - last)) / 1000);
      toast({
        title: "Just rescanned",
        description: `Give it ${wait}s before rescanning the same slip - AI calls cost money per attempt.`,
        variant: "destructive",
      });
      return;
    }
    setLastRescanAt((m) => ({ ...m, [receiptId]: Date.now() }));
    setRescanningId(receiptId);
    try {
      const res = await fetch(`/api/receipts/${receiptId}/rescan`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Rescan failed");
      const lineCount = json.extraction?.line_items?.length ?? 0;
      const warnings = json.extraction?.warnings || [];
      const tokens = json.ai?.tokens_out ?? 0;
      if (lineCount === 0) {
        toast({
          title: "AI couldn't read line items",
          description: warnings.length > 0
            ? `${warnings.slice(0, 2).join(" · ")} (${tokens} output tokens)`
            : `Try a clearer photo of the slip. (${tokens} output tokens, no warnings returned)`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `AI read ${lineCount} line${lineCount === 1 ? "" : "s"}`,
        description: warnings.length > 0
          ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} - review carefully.`
          : "Review the tags and save when you're happy.",
      });
      setRescanResult({ receiptId, mappedData: json.extraction });
    } catch (e: unknown) {
      toast({ title: "Rescan failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setRescanningId(null);
    }
  };

  // Add slip dialog
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVendor, setNewVendor] = useState("");
  const [newDate, setNewDate] = useState<string>(toLocalISO(new Date()));
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
    if (!companyId || !userId) return;
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
        uploadedBy: userId,
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
      setNewDate(toLocalISO(new Date()));
      setNewTotal("");
      setNewNotes("");
      setNewFile(null);
      setExpanded((prev) => new Set([...prev, created.id]));
      await reload();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "", variant: "destructive" });
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
    // SHOP-J (tabs audit, 2026-05-24): every other CSV export in
    // this codebase prepends a UTF-8 BOM so Excel-ZA reads R + ZAR
    // diacritics correctly. Receipts was the lone holdout - mangled
    // year-end accountant exports.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-purchases-${windowKind}-${toLocalISO(new Date())}.csv`;
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
      {/* TOOLBAR */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-600" />
            Receipts &amp; tax-deductible log
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Snap a slip, tap each line, mark what's deductible. Year-end CSV is one click.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5" disabled={receipts.length === 0}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700">
            <Camera className="w-4 h-4" />
            Add slip by hand
          </Button>
        </div>
      </div>

      {/* SUMMARY */}
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
        {/* SHOP-J: clickable filter tile. Audit caught this was a
            dead-stat. Now: tap to filter the list to slips with
            zero lines. Tap again to clear. */}
        <button
          type="button"
          onClick={() => setNeedsLinesOnly((v) => !v)}
          disabled={summary.unfiledCount === 0}
          className="text-left disabled:cursor-default"
        >
          <Card
            className={`border-0 shadow-sm transition ${
              summary.unfiledCount > 0 ? "bg-amber-50 hover:bg-amber-100" : ""
            } ${needsLinesOnly ? "ring-2 ring-amber-400" : ""}`}
          >
            <CardContent className="py-4 px-4">
              <p className={`text-xs uppercase tracking-wide font-semibold ${summary.unfiledCount > 0 ? "text-amber-700" : "text-slate-500"}`}>
                Slips needing lines{needsLinesOnly ? " · filtering" : ""}
              </p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${summary.unfiledCount > 0 ? "text-amber-900" : "text-slate-900"}`}>
                {summary.unfiledCount}
              </p>
              {summary.unfiledCount > 0 && (
                <p className="text-[10px] text-amber-700 mt-0.5">
                  {needsLinesOnly ? "Tap again to clear filter" : "Tap to filter the list"}
                </p>
              )}
            </CardContent>
          </Card>
        </button>
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
            <h3 className="text-base font-semibold text-slate-900">No slips in this window yet</h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Use the till slip scanner above to upload photos - the AI will extract the lines for you.
              Or add one by hand with the button up top.
            </p>
          </CardContent>
        </Card>
      ) : (() => {
        // SHOP-J: apply the "needing lines" filter from the
        // summary tile.
        const visible = needsLinesOnly ? receipts.filter((r) => r.items.length === 0) : receipts;
        if (visible.length === 0) {
          return (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-10 text-center text-sm text-slate-500">
                No slips match the current filter.
                <button
                  type="button"
                  onClick={() => setNeedsLinesOnly(false)}
                  className="ml-2 text-blue-600 hover:underline"
                >
                  Clear filter
                </button>
              </CardContent>
            </Card>
          );
        }
        return (
          <div className="space-y-2">
            {visible.map((r) => (
              <ReceiptRow
                key={r.id}
                receipt={r}
                expanded={expanded.has(r.id)}
                onToggle={() => toggleExpand(r.id)}
                onChanged={reload}
                onRescan={handleRescan}
                rescanning={rescanningId === r.id}
              />
            ))}
          </div>
        );
      })()}

      {/* ADD SLIP DIALOG */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-600" />
              Add slip by hand
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

      {/* Reconcile drawer for the AI rescan result */}
      <ReconcileSlipDrawer
        open={!!rescanResult}
        onClose={() => setRescanResult(null)}
        onSaved={() => { setRescanResult(null); reload(); }}
        mappedData={rescanResult?.mappedData ?? null}
        sourceData={null}
        companyId={companyId || ""}
        userId={userId || ""}
        existingReceiptId={rescanResult?.receiptId}
      />
    </>
  );
}

function ReceiptRow({
  receipt, expanded, onToggle, onChanged, onRescan, rescanning,
}: {
  receipt: ReceiptWithItems;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
  onRescan: (id: string) => void;
  rescanning: boolean;
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
    } catch (err: unknown) {
      toast({ title: "Couldn't add line", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDeductible = async (itemId: string, next: boolean) => {
    try {
      await updateItem({ itemId, isDeductible: next });
      await onChanged();
    } catch (err: unknown) {
      toast({ title: "Couldn't update", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Remove this line?")) return;
    try {
      await deleteItem(itemId);
      await onChanged();
    } catch (err: unknown) {
      toast({ title: "Couldn't delete", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const handleDeleteSlip = async () => {
    if (!confirm("Delete this slip and all its lines?")) return;
    try {
      await softDeleteReceipt(receipt.id);
      await onChanged();
    } catch (err: unknown) {
      toast({ title: "Couldn't delete", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const itemsTotal = receipt.deductibleTotal + receipt.nonDeductibleTotal;
  const slipTotal = Number(receipt.total ?? 0);
  const drift = slipTotal > 0 ? Math.abs(itemsTotal - slipTotal) : 0;
  const driftBig = drift > slipTotal * 0.05 && drift > 1;
  // Direction matters for the operator - "lines over slip" means
  // they probably need to delete a line; "lines under slip" means
  // a line was missed. Surface the signed delta so the wording is
  // unambiguous instead of just saying 'mismatch'.
  const driftDirection: "over" | "under" | null =
    !driftBig ? null : itemsTotal > slipTotal ? "over" : "under";

  return (
    // TAX-B: id anchor so /admin/tax-purchases's "Fix on Shopping"
    // deep-link can scrollIntoView.
    <Card id={`receipt-row-${receipt.id}`} className="border-0 shadow-sm">
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
                <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px]">
                  Lines {driftDirection === "over" ? "exceed" : "under"} slip by {fmtR(drift)}
                </Badge>
              )}
              {receipt.image_path && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRescan(receipt.id); }}
                  disabled={rescanning}
                  title="Re-run the AI on this slip image to extract line items + tax tags"
                  className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 disabled:opacity-60"
                >
                  {rescanning ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Reading...</>
                  ) : (
                    <><Sparkles className="w-3 h-3" /> Rescan with AI</>
                  )}
                </button>
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
            {/* Mismatch banner - shown when sum of line items diverges
                from the slip's grand total. Tells the operator the
                numbers and what to look for, so they can fix the
                source data instead of trusting bad totals. */}
            {driftBig && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 space-y-1">
                <p className="font-semibold">
                  Lines {driftDirection === "over" ? "exceed" : "fall short of"} the slip total by {fmtR(drift)}
                </p>
                <p className="text-rose-700">
                  Slip says <span className="font-semibold tabular-nums">{fmtR(slipTotal)}</span>{" "}
                  but lines below sum to <span className="font-semibold tabular-nums">{fmtR(itemsTotal)}</span>.
                  Until this matches, the deductible / non-deductible split above is unreliable.
                </p>
                <p className="text-rose-700">
                  {driftDirection === "over"
                    ? "Likely a duplicate line, VAT counted twice, or a discount recorded as positive. Review the rows below and delete or correct the offender."
                    : "Likely a missed line. Add what's missing or rescan the slip with AI."}
                </p>
              </div>
            )}
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
