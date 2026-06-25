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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Receipt, Upload, Plus, Trash2, Download, AlertCircle, Search,
  FileText, Loader2, Camera, ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ReconcileSlipDrawer, type Extraction } from "@/components/shopping/ReconcileSlipDrawer";
import { toLocalISO } from "@/lib/localDate";
import { supabase } from "@/integrations/supabase/client";
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
  v == null ? "-" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  // SHOP-K (tabs deferred, 2026-05-24): search by vendor / amount /
  // note + vendor-filter chip from the list itself.
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  // SHOP-K: deferred delete confirms - lifted out of native
  // confirm() to AlertDialog for consistent UX + a11y.
  const [confirmDeleteLine, setConfirmDeleteLine] = useState<{ receiptId: string; itemId: string; description: string } | null>(null);
  const [confirmDeleteSlip, setConfirmDeleteSlip] = useState<{ id: string; label: string } | null>(null);

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

  // SHOP-K: realtime subscription. Audit caught that phone-scanned
  // slips don't show on the desktop tab without a reload. Two
  // channels (one per table) with a shared debounced reload so a
  // batch upload doesn't thrash. company_id filter scopes both.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { reload(); }, 1500);
    };
    const channel = supabase
      .channel(`receipts-tab:${companyId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_receipts", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_receipt_items", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

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

  // SHOP-K: lifted delete-confirm handlers. Both call services that
  // exist at parent scope already - deleteItem and softDeleteReceipt.
  // After success we refresh through reload(); realtime would also
  // pick it up but the explicit reload is faster.
  const handleConfirmDeleteLine = async () => {
    if (!confirmDeleteLine) return;
    try {
      await deleteItem(confirmDeleteLine.itemId);
      toast({ title: "Line removed" });
      await reload();
    } catch (err: unknown) {
      toast({ title: "Couldn't delete line", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setConfirmDeleteLine(null);
    }
  };

  const handleConfirmDeleteSlip = async () => {
    if (!confirmDeleteSlip) return;
    try {
      await softDeleteReceipt(confirmDeleteSlip.id);
      toast({ title: "Slip deleted", description: "It's soft-deleted - ping support if you need it back." });
      await reload();
    } catch (err: unknown) {
      toast({ title: "Couldn't delete slip", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setConfirmDeleteSlip(null);
    }
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
          <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1.5 bg-brand-primary hover:bg-brand-primary/90 text-white">
            <Camera className="w-4 h-4" />
            Add slip by hand
          </Button>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
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
        {/* SHOP-K: VAT-claimable surface. The summarise()
            function returned vatClaimableTotal but no tile ever
            showed it. SARS-input use case for VAT-registered
            tenants. Mismatch chip overlays when lines diverge
            from slip totals on N receipts in this window. */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-indigo-100">
          <CardContent className="py-4 px-4">
            <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">VAT input</p>
            <p className="text-2xl font-bold text-blue-900 mt-1 tabular-nums">{fmtR(summary.vatClaimableTotal)}</p>
            {summary.mismatchCount > 0 && (
              <p className="text-[10px] text-rose-700 mt-0.5 font-medium">
                {summary.mismatchCount} mismatch{summary.mismatchCount === 1 ? "" : "es"} - review before filing
              </p>
            )}
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

      {/* WINDOW PICKER + SEARCH */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
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
                    ? "bg-brand-primary text-white font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* SHOP-K: search across vendor + notes + total. Cheap
              client-side filter over already-loaded receipts. */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, notes, amount..."
              className="pl-9 h-9"
            />
          </div>
          {vendorFilter && (
            <button
              type="button"
              onClick={() => setVendorFilter(null)}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-amber-800"
              title="Clear vendor filter"
            >
              <span>Vendor: <strong>{vendorFilter}</strong></span>
              <span className="text-amber-600">×</span>
            </button>
          )}
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
        // SHOP-J + SHOP-K: stacked filters applied client-side.
        const q = search.trim().toLowerCase();
        const visible = receipts.filter((r) => {
          if (needsLinesOnly && r.items.length > 0) return false;
          if (vendorFilter && (r.vendor || "").toLowerCase() !== vendorFilter.toLowerCase()) return false;
          if (q) {
            const hay = [
              r.vendor || "",
              r.notes || "",
              r.total != null ? String(r.total) : "",
              r.receipt_date || "",
              ...r.items.map((it) => `${it.description} ${it.notes || ""}`),
            ].join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
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
                onRequestDeleteLine={(itemId, description) =>
                  setConfirmDeleteLine({ receiptId: r.id, itemId, description })
                }
                onRequestDeleteSlip={(id, label) => setConfirmDeleteSlip({ id, label })}
                onVendorClick={(vendor) => setVendorFilter(vendor)}
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
            <Button onClick={handleAddSlip} disabled={adding} className="bg-brand-primary hover:bg-brand-primary/90 text-white gap-1.5">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {adding ? "Saving…" : "Save slip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHOP-K: delete-line confirm. Replaces native confirm() so the
          UX matches the rest of the app + reads on touch devices. */}
      <AlertDialog open={!!confirmDeleteLine} onOpenChange={(o) => { if (!o) setConfirmDeleteLine(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this line?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteLine?.description
                ? <>Removing <strong>{confirmDeleteLine.description}</strong> from this slip. The slip itself stays. You can re-add it after.</>
                : "Removing this line from the slip. The slip stays. You can re-add it after."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteLine} className="bg-rose-600 hover:bg-rose-700">
              Delete line
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SHOP-K: delete-slip confirm. Soft delete - the row hides but
          the record stays for audit. Wording flags this. */}
      <AlertDialog open={!!confirmDeleteSlip} onOpenChange={(o) => { if (!o) setConfirmDeleteSlip(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slip?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteSlip?.label
                ? <>Removing the <strong>{confirmDeleteSlip.label}</strong> slip and all its lines from the visible log. This is a soft delete - the record stays in the database for audit, just hidden here.</>
                : "Removing this slip from the visible log. Soft delete - hidden but still in the database."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteSlip} className="bg-rose-600 hover:bg-rose-700">
              Delete slip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  onRequestDeleteLine, onRequestDeleteSlip, onVendorClick,
}: {
  receipt: ReceiptWithItems;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
  onRescan: (id: string) => void;
  rescanning: boolean;
  // SHOP-K: delete confirms lifted to AlertDialog at the parent
  // level. Row asks the parent to open the dialog; parent owns
  // the actual delete + onChanged refresh.
  onRequestDeleteLine: (itemId: string, description: string) => void;
  onRequestDeleteSlip: (id: string, label: string) => void;
  // SHOP-K: clicking the vendor name sets the parent's
  // vendorFilter chip. One tap to "show me everything from
  // Makro" - vendor negotiation use case.
  onVendorClick: (vendor: string) => void;
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

  // SHOP-K: hand off to the parent's AlertDialog.
  const handleDeleteItem = (itemId: string, description: string) => {
    onRequestDeleteLine(itemId, description);
  };

  const handleDeleteSlip = () => {
    onRequestDeleteSlip(receipt.id, receipt.vendor || "Untitled vendor");
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
        {/* SHOP-K: dropped the wrapping <button> because we now nest
            a vendor-click button + rescan button inside. The chevron
            zone + image + spacer area is the toggle target; vendor
            name is its own button that filters; rescan unchanged. */}
        <div className="w-full flex items-center gap-3 text-left">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-3 shrink-0"
            aria-label={expanded ? "Collapse slip" : "Expand slip"}
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
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 min-w-0 text-left"
            aria-label={expanded ? "Collapse slip" : "Expand slip"}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {receipt.vendor ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onVendorClick(receipt.vendor as string); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onVendorClick(receipt.vendor as string);
                    }
                  }}
                  title={`Show only ${receipt.vendor} slips`}
                  className="text-sm font-semibold text-slate-900 hover:text-amber-700 hover:underline cursor-pointer"
                >
                  {receipt.vendor}
                </span>
              ) : (
                <p className="text-sm font-semibold text-slate-500 italic">Untitled vendor</p>
              )}
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
          </button>
        </div>

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
                  <LineRow
                    key={it.id}
                    item={it}
                    onToggleDeductible={handleToggleDeductible}
                    onUpdateNotes={async (next) => {
                      try {
                        await updateItem({ itemId: it.id, notes: next });
                        await onChanged();
                      } catch (err: unknown) {
                        toast({ title: "Couldn't save note", description: err instanceof Error ? err.message : "", variant: "destructive" });
                      }
                    }}
                    onRequestDelete={() => handleDeleteItem(it.id, it.description)}
                  />
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
              <Button size="sm" onClick={handleAddItem} disabled={busy} className="gap-1 bg-brand-primary hover:bg-brand-primary/90 text-white">
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

// SHOP-K (tabs deferred, 2026-05-24): per-line notes editor. Schema
// has a notes column on purchase_receipt_items but nothing wrote to
// it. Accountants ask "what was the 50kg lamb actually for?" - the
// note is the cheap answer. Click to edit, blur or Enter to save.
function LineRow({
  item,
  onToggleDeductible,
  onUpdateNotes,
  onRequestDelete,
}: {
  item: ReceiptWithItems["items"][number];
  onToggleDeductible: (itemId: string, next: boolean) => void | Promise<void>;
  onUpdateNotes: (next: string | null) => Promise<void>;
  onRequestDelete: () => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.notes || "");

  const commitNote = async () => {
    const trimmed = noteDraft.trim();
    const next = trimmed.length === 0 ? null : trimmed;
    if ((next || null) === (item.notes || null)) {
      setEditingNote(false);
      return;
    }
    await onUpdateNotes(next);
    setEditingNote(false);
  };

  return (
    <div className="flex items-start gap-2 text-sm">
      <div className="flex-1 min-w-0">
        <p className="text-slate-900 truncate">{item.description}</p>
        {editingNote ? (
          <Input
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitNote(); }
              if (e.key === "Escape") { setNoteDraft(item.notes || ""); setEditingNote(false); }
            }}
            placeholder="Note for the accountant (e.g. Smith wedding stock)"
            className="h-7 text-[12px] mt-0.5"
          />
        ) : item.notes ? (
          <button
            type="button"
            onClick={() => { setNoteDraft(item.notes || ""); setEditingNote(true); }}
            className="text-[11px] text-slate-500 hover:text-amber-700 hover:underline text-left truncate block w-full"
            title="Edit note"
          >
            {item.notes}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setNoteDraft(""); setEditingNote(true); }}
            className="text-[11px] text-slate-400 hover:text-amber-700 hover:underline italic"
            title="Add a note for the accountant"
          >
            + Add note
          </button>
        )}
      </div>
      <span className="tabular-nums text-slate-700 shrink-0 w-24 text-right pt-0.5">{fmtR(item.amount)}</span>
      <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0 pt-0.5">
        <Switch
          checked={item.is_deductible}
          onCheckedChange={(v: boolean) => onToggleDeductible(item.id, v)}
        />
        <span className={item.is_deductible ? "text-emerald-700 font-medium" : "text-slate-500"}>
          {item.is_deductible ? "Deductible" : "Skip"}
        </span>
      </label>
      <Button variant="ghost" size="sm" onClick={onRequestDelete} className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
