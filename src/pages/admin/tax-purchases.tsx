/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * /admin/tax-purchases - read-only accountant overview.
 *
 * The editing surface (snap a slip, mark deductibles, add lines, etc.)
 * lives on /admin/shopping under the "Receipts" tab so admins act in
 * one place. This page is the accountant's lens onto the same data:
 * window-filtered totals, deductibility breakdown, and the CSV export
 * they hand to SARS. No edit affordances here on purpose.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt, Download, FileText, ShoppingCart, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toLocalISO } from "@/lib/localDate";import { useTenantHref } from "@/lib/tenantUrl";
import {
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

function TaxPurchasesPage() {
  const { user, profile } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? user?.company_id ?? null;

  const [receipts, setReceipts] = useState<ReceiptWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowKind, setWindowKind] = useState<WindowKind>("this_month");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const range = dateRangeFor(windowKind);
        const list = await listForCompany({ companyId, fromDate: range.from, toDate: range.to });
        if (!cancelled) setReceipts(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, windowKind]);

  const summary = useMemo(() => summarise(receipts), [receipts]);

  // Roll up deductible lines by category for the breakdown table. Lines
  // without a category fall under "Uncategorised" so the accountant
  // can see what still needs a code.
  const deductibleByCategory = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of receipts) {
      for (const it of r.items) {
        if (!it.is_deductible) continue;
        const key = (it.category || "").trim() || "Uncategorised";
        const cur = map.get(key) || { count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(it.amount) || 0;
        map.set(key, cur);
      }
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [receipts]);

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
    a.download = `tax-purchases-${windowKind}-${toLocalISO(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Tax overview | Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100">
        <div className="overflow-x-hidden lg:pl-72 xl:pl-80">
          <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-24 max-w-screen-2xl">

            {/* HEADER */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                      <Receipt className="w-6 h-6 text-white" />
                    </div>
                    Tax overview
                  </h1>
                  <p className="text-slate-600 max-w-2xl text-sm">
                    Read-only view of your deductible spend. Snapping slips, marking lines and editing the log all happen on the Shopping dashboard now. This page is the accountant's lens onto the same data.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5" disabled={receipts.length === 0}>
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                  <Link href={withSlug("/admin/shopping?tab=receipts")}>
                    <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                      <ShoppingCart className="w-4 h-4" />
                      Manage receipts
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* WHERE-TO-EDIT BANNER */}
            <Card className="border-0 shadow-sm bg-emerald-50 mb-4">
              <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                <ShoppingCart className="w-5 h-5 text-emerald-700 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-900">All edits happen on the Shopping dashboard</p>
                  <p className="text-xs text-emerald-800/80">
                    Add slips, mark lines deductible, rescan with AI and intake stock all in one place. This page is read-only on purpose.
                  </p>
                </div>
                <Link href={withSlug("/admin/shopping?tab=receipts")} className="text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 text-xs font-semibold">
                  Go to receipts tab <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </CardContent>
            </Card>

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

            {/* DEDUCTIBLE BREAKDOWN BY CATEGORY */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="py-4 px-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Deductible spend by category
                </h2>
                {loading ? (
                  <p className="text-xs text-slate-500">Loading…</p>
                ) : deductibleByCategory.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No deductible lines in this window yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 pr-3">Category</th>
                          <th className="text-right py-2 px-3">Lines</th>
                          <th className="text-right py-2 pl-3">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deductibleByCategory.map((row) => (
                          <tr key={row.category} className="border-b border-slate-100">
                            <td className="py-2 pr-3 text-slate-900">{row.category}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-600">{row.count}</td>
                            <td className="py-2 pl-3 text-right tabular-nums font-semibold text-emerald-700">{fmtR(row.total)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="py-2 pr-3 font-semibold text-slate-900">Total deductible</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                            {deductibleByCategory.reduce((s, r) => s + r.count, 0)}
                          </td>
                          <td className="py-2 pl-3 text-right tabular-nums font-bold text-emerald-700">
                            {fmtR(summary.deductibleTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RECENT SLIPS (READ-ONLY LIST) */}
            <Card className="border-0 shadow-sm">
              <CardContent className="py-4 px-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-600" />
                  Slips in this window
                </h2>
                {loading ? (
                  <p className="text-xs text-slate-500">Loading…</p>
                ) : receipts.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-600">No slips in this window yet.</p>
                    <Link href={withSlug("/admin/shopping?tab=receipts")}>
                      <Button size="sm" variant="outline" className="gap-1.5 mt-2">
                        <ShoppingCart className="w-4 h-4" />
                        Add one on Shopping
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {receipts.map((r) => {
                      const itemsTotal = r.deductibleTotal + r.nonDeductibleTotal;
                      const slipTotal = Number(r.total ?? 0);
                      const drift = slipTotal > 0 ? Math.abs(itemsTotal - slipTotal) : 0;
                      const driftBig = drift > slipTotal * 0.05 && drift > 1;
                      return (
                        <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-b-0">
                          {r.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image_url} alt="" className="w-9 h-9 object-cover rounded border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                              <FileText className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {r.vendor || "Untitled vendor"}
                              </p>
                              {r.receipt_date && (
                                <span className="text-xs text-slate-500">
                                  {new Date(r.receipt_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                                </span>
                              )}
                              {r.items.length === 0 && (
                                <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">No lines yet</Badge>
                              )}
                              {driftBig && (
                                <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px]">Lines mismatch slip total</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-600 mt-0.5">
                              {r.total != null && <span>Slip: <span className="font-medium text-slate-900">{fmtR(r.total)}</span></span>}
                              <span className="text-emerald-700">Deductible: <span className="font-medium">{fmtR(r.deductibleTotal)}</span></span>
                              {r.nonDeductibleTotal > 0 && (
                                <span className="text-slate-500">Non-ded: <span className="font-medium">{fmtR(r.nonDeductibleTotal)}</span></span>
                              )}
                            </div>
                          </div>
                          {r.image_url && (
                            <a href={r.image_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline shrink-0">
                              View slip
                            </a>
                          )}
                        </div>
                      );
                    })}
                    <div className="pt-3 text-center">
                      <Link href={withSlug("/admin/shopping?tab=receipts")} className="text-xs text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 font-semibold">
                        Edit any of these on the Shopping dashboard <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        <div className="lg:pl-72 xl:pl-80">
          <Footer />
        </div>
      </div>
    </>
  );
}

export default function ProtectedTaxPurchasesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <TaxPurchasesPage />
    </ProtectedRoute>
  );
}
