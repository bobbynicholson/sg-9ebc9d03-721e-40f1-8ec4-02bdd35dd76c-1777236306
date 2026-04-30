/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding/receipts -- AI receipt scanner.
 *
 * Operator drops up to 20 photos of supplier slips. Each goes
 * through Claude vision and comes back as structured fields:
 * supplier, date, total, line items with unit prices. The team
 * reviews + commits to inventory_items / supplier_orders.
 *
 * For Callum's day-one onboarding: photograph the last 20 slips,
 * upload them all, and the system pre-loads cost prices on his
 * inventory in 30 seconds instead of an hour of typing.
 */
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Upload, ArrowLeft, Loader2, FileImage, AlertTriangle,
  CheckCircle2, X, Sparkles, Clock,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/ChatBot";
import { InfoTooltip } from "@/components/ui/info-tooltip";

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

const fmtR = (v: any) =>
  v == null
    ? "—"
    : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProtectedReceiptsImport() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ReceiptsImportPage />
    </ProtectedRoute>
  );
}

function ReceiptsImportPage() {
  const { user } = useAuth() as any;
  const companyId = (user?.user_metadata?.company_id as string | undefined) || null;
  const { toast } = useToast();

  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowShape[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const slugPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/([^/]+)\/admin\//);
    return m ? `/${m[1]}` : "";
  }, []);

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
      // Pull rows for the preview.
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
      <NoIndexMeta />
      <Head>
        <title>Receipt scanner | CateringMS Admin</title>
      </Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-xl mx-auto">

          {/* Header */}
          <div className="mb-4">
            <Link href={`${slugPrefix}/admin/onboarding`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to imports
              </Button>
            </Link>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                Receipt scanner
                <InfoTooltip content={"Snap photos of your last few weeks of supplier slips and we'll seed your inventory cost prices automatically.\n\nClaude vision reads each receipt and pulls the supplier name, date, line items, quantities and totals. You review the extraction and commit, no typing required."} />
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Photograph up to {MAX_FILES} supplier slips. The model extracts supplier, date, line items and cost prices so your inventory loads itself.
              </p>
            </div>
          </div>

          {/* Upload card */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4 text-purple-600" />
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
                className="border-2 border-dashed border-purple-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition"
              >
                <FileImage className="w-10 h-10 mx-auto text-purple-400 mb-2" />
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
                  className="bg-gradient-to-r from-purple-600 to-pink-600"
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
                  Sequential extraction · ~3 s per slip · ~R0.05 per batch
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

              {jobId && (
                <p className="text-[11px] text-slate-500 text-center pt-2">
                  Job ID <code className="font-mono">{jobId}</code>, visible on{" "}
                  <Link
                    href={`${slugPrefix}/admin/onboarding`}
                    className="underline hover:text-slate-700"
                  >
                    imports history
                  </Link>{" "}
                  for rollback within 24 h.
                </p>
              )}
            </div>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId || undefined} />
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
