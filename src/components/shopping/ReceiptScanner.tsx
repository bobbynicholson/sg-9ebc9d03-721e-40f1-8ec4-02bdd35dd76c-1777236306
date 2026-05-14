/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ReceiptScanner -- shared receipt-scanning UI body.
 *
 * Used by:
 *   - /admin/onboarding/receipts (day-one onboarding)
 *   - /team-portal/shopping/receipts (ongoing supplier slip captures)
 *
 * Each parent supplies its own page chrome (nav, breadcrumbs, intro
 * copy). This component owns the file picker, the upload call to
 * /api/imports/receipts/upload, and the per-receipt extraction
 * preview cards.
 *
 * The two surfaces look the same intentionally so a shopping staff
 * member who also helps with onboarding only learns one screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Loader2, FileImage, AlertTriangle, CheckCircle2, X,
  Sparkles, Clock, ListChecks,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { ReconcileSlipDrawer } from "@/components/shopping/ReconcileSlipDrawer";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface RowShape {
  id: string;
  sheet: string;
  source_data: any;
  mapped_data: any | null;
  status: string;
  error_message: string | null;
  preview_warnings: string[] | null;
}

const MAX_FILES = 20;

// Wave 24: tenant-aware money formatter. The receipt scanner is used
// in admin-onboarding-receipts and shopping; both have a tenant in
// scope, but the scanner shows extracted supplier-receipt totals which
// are denominated in whatever currency the supplier billed in. Default
// formatter takes a code so the call site can pass either the tenant
// currency or the receipt's own currency once OCR pulls one out.
const buildFmt = (code: string) => (v: any) => {
  if (v == null) return "—";
  const locale = code === "ZAR" ? "en-ZA"
    : code === "USD" ? "en-US"
    : code === "GBP" ? "en-GB"
    : code === "EUR" ? "en-IE"
    : "en-ZA";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
  } catch {
    return `${code} ${Number(v).toFixed(2)}`;
  }
};

interface ReceiptScannerProps {
  /** Where the imports-history link points. Defaults to the admin
   *  onboarding hub but the shopping surface can override to keep
   *  shopping staff inside their portal. */
  historyHref?: string;
  /** Tone of the upload card title. Both surfaces use purple today
   *  but kept as a prop so a future surface can override. */
  accent?: "purple" | "emerald";
}

export function ReceiptScanner({
  historyHref,
  accent = "purple",
}: ReceiptScannerProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  // Wave 24: tenant-currency aware. Receipts are denominated in the
  // tenant's currency (a UK caterer's slips come in GBP) so we format
  // extracted amounts in that currency.
  const tenantCurrency = useTenantCurrency(companyId ?? null);
  const fmtR = useMemo(() => buildFmt(tenantCurrency.code), [tenantCurrency.code]);
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowShape[]>([]);
  const [reconcileRow, setReconcileRow] = useState<RowShape | null>(null);
  const [savedRowIds, setSavedRowIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accentText = accent === "emerald" ? "text-emerald-600" : "text-purple-600";
  const accentBorder = accent === "emerald" ? "border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50" : "border-purple-300 hover:border-purple-500 hover:bg-purple-50";
  const accentIcon = accent === "emerald" ? "text-emerald-400" : "text-purple-400";
  const accentBtn = accent === "emerald"
    ? "bg-gradient-to-r from-emerald-600 to-teal-600"
    : "bg-gradient-to-r from-purple-600 to-pink-600";

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    const valid: File[] = [];
    for (const f of arr) {
      const mime = (f.type || "").toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
        toast({
          title: `Skipping "${f.name}"`,
          description: `Type ${mime || "(unknown)"} not supported. JPG, PNG, WebP only.`,
          variant: "destructive",
        });
        continue;
      }
      valid.push(f);
    }
    const next = [...picked, ...valid].slice(0, MAX_FILES);
    if (picked.length + valid.length > MAX_FILES) {
      toast({
        title: `Trimmed to ${MAX_FILES} images`,
        description: "Run a second batch for the rest.",
      });
    }
    setPicked(next);
  };

  const removePicked = (idx: number) =>
    setPicked((prev) => prev.filter((_, i) => i !== idx));

  const upload = async () => {
    if (picked.length === 0) {
      toast({ title: "Pick at least one receipt", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/imports/receipts/upload", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Upload failed");
      setJobId(json.jobId);
      toast({
        title: `Scanned ${json.processed} receipt${json.processed === 1 ? "" : "s"}`,
        description: `${json.ai?.tokens_out || 0} tokens read by the model. Review the extractions below.`,
      });
      try {
        const r = await fetch(`/api/imports/${json.jobId}?rows=1`);
        const rj = await r.json();
        if (r.ok) setRows(rj.rows || []);
      } catch { /* non-fatal */ }
    } catch (e: any) {
      toast({ title: "Receipt scan failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Aggregated stats for the post-scan summary bar.
  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    let okCount = 0, errCount = 0, lineCount = 0, total = 0;
    const suppliers = new Set<string>();
    for (const r of rows) {
      if (r.status === "error") { errCount += 1; continue; }
      okCount += 1;
      const m = r.mapped_data || {};
      if (m.supplier_name) suppliers.add(String(m.supplier_name));
      if (Array.isArray(m.line_items)) lineCount += m.line_items.length;
      if (typeof m.total === "number") total += m.total;
    }
    return { okCount, errCount, lineCount, suppliers: suppliers.size, total };
  }, [rows]);

  return (
    <>
      {/* Upload card */}
      <Card className="border-0 shadow-lg mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className={`w-4 h-4 ${accentText}`} />
            Upload receipts
            <InfoTooltip content={"Pick up to 20 receipt photos at once. The clearer the photo (whole slip in frame, decent light), the cleaner the extraction.\n\nWe also handle phone screenshots of supplier emails and PDF receipts you've saved as JPG."} />
          </CardTitle>
          <CardDescription>
            JPG, PNG or WebP. 8 MB per image, {MAX_FILES} max per batch. Crisp lighting and the whole slip in frame work best.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); onPickFiles(e.dataTransfer.files); }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${accentBorder}`}
          >
            <FileImage className={`w-10 h-10 mx-auto mb-2 ${accentIcon}`} />
            <p className="text-sm font-medium text-slate-700">
              Click to pick files, or drop them here
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {picked.length} of {MAX_FILES} selected
            </p>
          </div>

          {picked.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {picked.map((f, i) => (
                <ReceiptThumb
                  key={`${f.name}-${i}`}
                  file={f}
                  onRemove={() => removePicked(i)}
                  disabled={busy}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={upload}
              disabled={busy || picked.length === 0}
              className={accentBtn}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Reading {picked.length} receipt{picked.length === 1 ? "" : "s"}...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Scan {picked.length || ""} receipt{picked.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
            {picked.length > 0 && !busy && (
              <Button variant="ghost" onClick={() => setPicked([])}>
                Clear all
              </Button>
            )}
            <p className="text-[11px] text-slate-500 ml-2">
              Sequential extraction, around 3 s per slip, around ZAR 0.05 per batch
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Per-receipt extraction results */}
      {stats && (
        <Card className="border-0 shadow-md mb-4">
          <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <strong>{stats.okCount}</strong> read
            </span>
            {stats.errCount > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-600">
                <AlertTriangle className="w-4 h-4" />
                <strong>{stats.errCount}</strong> failed
              </span>
            )}
            <span className="text-slate-600">
              <strong className="text-slate-900">{stats.suppliers}</strong> supplier{stats.suppliers === 1 ? "" : "s"}
            </span>
            <span className="text-slate-600">
              <strong className="text-slate-900">{stats.lineCount}</strong> line item{stats.lineCount === 1 ? "" : "s"}
            </span>
            <span className="ml-auto text-slate-700">
              Combined slip total: <strong>{fmtR(stats.total)}</strong>
            </span>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r, idx) => {
            const m = r.mapped_data || {};
            const hasError = r.status === "error";
            const warnings = r.preview_warnings || m.warnings || [];
            const lines: any[] = Array.isArray(m.line_items) ? m.line_items : [];
            return (
              <Card key={r.id} className={hasError ? "border-rose-200" : "border-0 shadow-md"}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs text-slate-500 font-mono">#{idx + 1}</span>
                        <h3 className="text-base font-semibold text-slate-900">
                          {hasError ? "Read failed" : (m.supplier_name || "(supplier unclear)")}
                        </h3>
                        {hasError ? (
                          <Badge className="bg-rose-100 text-rose-700 border-rose-200 border">Error</Badge>
                        ) : (warnings.length > 0 ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 border">Review</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Clean</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <FileImage className="w-3 h-3" />
                          {r.source_data?.filename || "(no name)"}
                        </span>
                        {m.receipt_date && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(m.receipt_date).toLocaleDateString("en-ZA", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                          </span>
                        )}
                        {m.receipt_number && <span>Ref: {m.receipt_number}</span>}
                        {m.payment_method && <span className="capitalize">via {m.payment_method}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
                      <p className="text-xl font-bold text-emerald-600">{fmtR(m.total)}</p>
                      {!hasError && (
                        savedRowIds.has(r.id) ? (
                          <Badge className="mt-1 bg-emerald-100 text-emerald-700 border-emerald-200 border">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Saved
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="mt-1 bg-gradient-to-r from-purple-600 to-pink-600"
                            onClick={() => setReconcileRow(r)}
                          >
                            <ListChecks className="w-3.5 h-3.5 mr-1.5" />
                            Reconcile & save
                          </Button>
                        )
                      )}
                    </div>
                  </div>

                  {hasError ? (
                    <p className="text-sm text-rose-600">{r.error_message}</p>
                  ) : (
                    <>
                      {warnings.length > 0 && (
                        <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 mb-2 text-xs text-amber-800">
                          {warnings.map((w: string, i: number) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {lines.length > 0 && (
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 text-left">
                              <tr>
                                <th className="py-1.5 px-3">Item</th>
                                <th className="py-1.5 px-3">Qty</th>
                                <th className="py-1.5 px-3">Unit price</th>
                                <th className="py-1.5 px-3 text-right">Line total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((li, i) => (
                                <tr key={i} className="border-t border-slate-100">
                                  <td className="py-1.5 px-3 text-slate-900">{li.description}</td>
                                  <td className="py-1.5 px-3 text-slate-600">
                                    {li.quantity ?? "—"}{li.unit ? ` ${li.unit}` : ""}
                                  </td>
                                  <td className="py-1.5 px-3 text-slate-600">{fmtR(li.unit_price)}</td>
                                  <td className="py-1.5 px-3 text-right font-medium text-slate-900">
                                    {fmtR(li.line_total)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {(m.subtotal || m.vat) && (
                        <div className="text-[11px] text-slate-500 mt-1.5 flex flex-wrap gap-3">
                          {m.subtotal != null && <span>Subtotal {fmtR(m.subtotal)}</span>}
                          {m.vat != null && <span>VAT {fmtR(m.vat)}</span>}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {jobId && historyHref && (
            <p className="text-[11px] text-slate-500 text-center pt-2">
              Job ID <code className="font-mono">{jobId}</code>, visible on{" "}
              <Link
                href={historyHref}
                className="underline hover:text-slate-700"
              >
                imports history
              </Link>{" "}
              for rollback within 24 h.
            </p>
          )}
        </div>
      )}

      {/* Reconcile drawer -- opens when the operator clicks 'Reconcile & save'
          on any successful extraction. Persists the slip to purchase_receipts
          + items and (optionally) feeds inventory via receiveStock. */}
      <ReconcileSlipDrawer
        open={!!reconcileRow}
        onClose={() => setReconcileRow(null)}
        onSaved={() => {
          if (reconcileRow) {
            setSavedRowIds((prev) => new Set([...prev, reconcileRow.id]));
          }
        }}
        mappedData={(reconcileRow?.mapped_data as any) || null}
        sourceData={(reconcileRow?.source_data as any) || null}
        companyId={companyId || ""}
        userId={user?.id || ""}
      />
    </>
  );
}

function ReceiptThumb({
  file, onRemove, disabled,
}: { file: File; onRemove: () => void; disabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-[3/4]">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="w-full h-full object-cover" />
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="absolute top-1 right-1 rounded-md bg-white/95 hover:bg-white shadow text-xs px-1.5 py-0.5 text-slate-700 inline-flex items-center gap-1 disabled:opacity-50"
        title="Remove"
      >
        <X className="w-3 h-3" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate">
        {file.name}
      </div>
    </div>
  );
}
