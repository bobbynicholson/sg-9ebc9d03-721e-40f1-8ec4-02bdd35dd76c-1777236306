/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/tax-purchases - read-only accountant overview.
 *
 * The editing surface (snap a slip, mark deductibles, add lines, etc.)
 * lives on /admin/shopping under the "Receipts" tab so admins act in
 * one place. This page is the accountant's lens onto the same data:
 * window-filtered totals, deductibility breakdown, VAT input claim,
 * SARS-readiness health, and the CSV export they hand to SARS.
 *
 * TAX-B (tax-purchases deferred, 2026-05-24):
 *   - VAT input claim split (rule.vat_input_claimable = 'claimable')
 *   - SARS-readiness health card (% slips with lines, % mismatches,
 *     overrides of non_deductible rules, oldest slip without lines)
 *   - YoY same-period-last-year compare
 *   - Per-month sparkline trend on deductible spend
 *   - Missing-slip calendar gap detection
 *   - Per-line drilldown drawer (no shopping bounce for inspection)
 *   - "Fix on Shopping" per-line deep-link for edits
 *   - Mobile card fallback under sm
 *   - Realtime channel on purchase_receipts + items
 *   - SA tax-year window option (1 Mar - 28 Feb)
 *   - Per-line amber "Override of non-deductible rule" badge
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
  Receipt, Download, FileText, ShoppingCart, ExternalLink, AlertTriangle,
  Calendar as CalendarIcon, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  ShieldCheck, Pencil, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import { supabase } from "@/integrations/supabase/client";
import {
  listForCompany,
  summarise,
  buildCsvExport,
  saTaxYearRange,
  monthlyDeductibleSparkline,
  detectMissingSlipWeeks,
  type ReceiptWithItems,
  type PurchaseReceiptItem,
} from "@/services/taxPurchaseService";

const fmtR = (v?: number | null) =>
  v == null ? "—" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type WindowKind = "this_month" | "this_quarter" | "this_year" | "tax_year" | "all";

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
  if (window === "tax_year") {
    return saTaxYearRange(now);
  }
  const from = new Date(now.getFullYear(), 0, 1);
  return { from: toLocalISO(from) };
}

/**
 * TAX-B: same window kind, shifted back one year. Used for the
 * YoY tile so we can read last year's totals through the same path.
 */
function priorYearRangeFor(window: WindowKind): { from?: string; to?: string } {
  if (window === "all") return {};
  const now = new Date();
  const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (window === "this_month") {
    const from = new Date(lastYear.getFullYear(), lastYear.getMonth(), 1);
    const to = new Date(lastYear.getFullYear(), lastYear.getMonth() + 1, 0);
    return { from: toLocalISO(from), to: toLocalISO(to) };
  }
  if (window === "this_quarter") {
    const q = Math.floor(lastYear.getMonth() / 3);
    const from = new Date(lastYear.getFullYear(), q * 3, 1);
    const to = new Date(lastYear.getFullYear(), q * 3 + 3, 0);
    return { from: toLocalISO(from), to: toLocalISO(to) };
  }
  if (window === "tax_year") {
    const r = saTaxYearRange(lastYear);
    return r;
  }
  const from = new Date(lastYear.getFullYear(), 0, 1);
  const to = new Date(lastYear.getFullYear(), 11, 31);
  return { from: toLocalISO(from), to: toLocalISO(to) };
}

function TaxPurchasesPage() {
  const { user, profile } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? user?.company_id ?? null;

  const [receipts, setReceipts] = useState<ReceiptWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowKind, setWindowKind] = useState<WindowKind>("this_month");
  // TAX-B: prior-year deductible total for the YoY delta. NULL =
  // not loaded yet / "all time" (which has no comparison window).
  const [priorYearDeductible, setPriorYearDeductible] = useState<number | null>(null);
  // TAX-B: a longer-window pull (180 days) feeds the sparkline and
  // missing-slip detection. Independent of the visible window so the
  // operator can flip "This month" without losing the trend chart.
  const [longRangeReceipts, setLongRangeReceipts] = useState<ReceiptWithItems[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Visible-window receipts.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const range = dateRangeFor(windowKind);
        const list = await listForCompany({ companyId, fromDate: range.from, toDate: range.to });
        if (!cancelled) setReceipts(list);
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/tax-purchases", step: "load-receipts", companyId },
        });
        if (!cancelled) {
          toast({ title: "Could not load slips", variant: "destructive" });
          setReceipts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, windowKind, refreshTick, toast]);

  // TAX-B: prior-year same-window pull. Cheap (no joins beyond what
  // listForCompany already does) so it runs on every window change.
  useEffect(() => {
    if (!companyId) return;
    if (windowKind === "all") { setPriorYearDeductible(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const range = priorYearRangeFor(windowKind);
        const list = await listForCompany({ companyId, fromDate: range.from, toDate: range.to });
        if (!cancelled) {
          setPriorYearDeductible(list.reduce((s, r) => s + r.deductibleTotal, 0));
        }
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/tax-purchases", step: "load-prior-year", companyId },
        });
        if (!cancelled) setPriorYearDeductible(null);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, windowKind, refreshTick]);

  // TAX-B: 180-day pull for the sparkline + missing-slip detector.
  // Runs once per mount per tenant + on realtime bumps.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date();
        since.setDate(since.getDate() - 180);
        const list = await listForCompany({ companyId, fromDate: toLocalISO(since) });
        if (!cancelled) setLongRangeReceipts(list);
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/tax-purchases", step: "load-long-range", companyId },
        });
        if (!cancelled) setLongRangeReceipts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshTick]);

  // TAX-B: realtime channel. New slip on /admin/shopping should
  // refresh this page; debounced 500ms because OCR fan-out can fire
  // multiple item INSERTs in a cluster.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((n) => n + 1), 500);
    };
    const channel = supabase
      .channel(`tax-purchases:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_receipts", filter: `company_id=eq.${companyId}` }, bump)
      // TAX-C (task #180, 2026-05-24): purchase_receipt_items now
      // carries company_id (migration 20260524220000) so we can
      // finally tenant-filter this subscription. Pre-fix it was
      // unfiltered and woke up on every tenant's OCR fan-out.
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_receipt_items", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const summary = useMemo(() => summarise(receipts), [receipts]);

  // TAX-B: SARS-readiness percentage. 100% = every slip has lines,
  // none mismatch, no rule overrides. Each shortcoming subtracts.
  const sarsReadiness = useMemo(() => {
    if (summary.receiptCount === 0) {
      return { score: null as number | null, color: "slate" as const };
    }
    let score = 100;
    score -= (summary.unfiledCount / summary.receiptCount) * 60; // huge: no lines = nothing claimable
    score -= (summary.mismatchCount / summary.receiptCount) * 25;
    // overrides scale by lines, not receipts - one override on a big
    // slip is bigger trouble than three on tiny ones, but we don't
    // know total lines here so flat penalty.
    if (summary.overrideCount > 0) score -= Math.min(15, summary.overrideCount * 5);
    score = Math.max(0, Math.round(score));
    const color = score >= 85 ? "emerald" : score >= 60 ? "amber" : "rose";
    return { score, color } as const;
  }, [summary]);

  // TAX-B: oldest slip still without lines. Surfaces in SARS card.
  const oldestUnclassified = useMemo(() => {
    return receipts
      .filter((r) => r.items.length === 0)
      .sort((a, b) => (a.receipt_date || "").localeCompare(b.receipt_date || ""))[0] || null;
  }, [receipts]);

  // YoY delta. Null prior = not enough history / "all time".
  const yoyDelta = useMemo(() => {
    if (priorYearDeductible == null) return null;
    if (priorYearDeductible === 0) return { pct: null as number | null, abs: summary.deductibleTotal };
    const diff = summary.deductibleTotal - priorYearDeductible;
    return { pct: (diff / priorYearDeductible) * 100, abs: diff };
  }, [priorYearDeductible, summary.deductibleTotal]);

  const sparkline = useMemo(() => monthlyDeductibleSparkline(longRangeReceipts, 6), [longRangeReceipts]);
  const missingWeeks = useMemo(() => detectMissingSlipWeeks(longRangeReceipts), [longRangeReceipts]);

  // Category rollup. Made clickable to filter the slip list below.
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

  // Top supplier rollup.
  const topSupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of receipts) {
      const key = (r.vendor || "Unnamed").trim();
      map.set(key, (map.get(key) || 0) + r.deductibleTotal);
    }
    const top = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? { vendor: top[0], total: top[1] } : null;
  }, [receipts]);

  // TAX-B: visible-slips filter when a category row is selected.
  const visibleReceipts = useMemo(() => {
    if (!categoryFilter) return receipts;
    return receipts.filter((r) =>
      r.items.some((it) => it.is_deductible && (it.category || "Uncategorised") === categoryFilter),
    );
  }, [receipts, categoryFilter]);

  const handleExportCsv = () => {
    if (receipts.length === 0) {
      toast({ title: "Nothing to export", description: "No receipts in this window yet." });
      return;
    }
    const csv = buildCsvExport(receipts);
    // TAX-B: UTF-8 BOM so Excel-ZA renders ZAR + diacritics.
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

            {/* TAX-B: page-level mismatch + override banner. Promotes
                the per-slip rose chip to a louder warning so the
                accountant sees it before exporting. */}
            {(summary.mismatchCount > 0 || summary.overrideCount > 0) && (
              <Card className="border-0 shadow-sm bg-amber-50 border-l-4 border-l-amber-500 mb-4">
                <CardContent className="py-3 px-4 flex items-start gap-3 flex-wrap">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900">
                      Review needed before export
                    </p>
                    <ul className="text-xs text-amber-800/90 mt-0.5 space-y-0.5 list-disc ml-4">
                      {summary.mismatchCount > 0 && (
                        <li>
                          {summary.mismatchCount} {summary.mismatchCount === 1 ? "slip has" : "slips have"} lines that don't reconcile to the printed slip total - check OCR captured every line.
                        </li>
                      )}
                      {summary.overrideCount > 0 && (
                        <li>
                          {summary.overrideCount} line{summary.overrideCount === 1 ? "" : "s"} marked deductible despite a rule that says non-deductible (e.g. tobacco, alcohol for personal use). SARS may disallow these on audit.
                        </li>
                      )}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

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
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="py-4 px-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Slips logged</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{summary.receiptCount}</p>
                  {topSupplier && (
                    <p className="text-[10px] text-slate-500 mt-1 truncate" title={`Top supplier: ${topSupplier.vendor}`}>
                      Top: {topSupplier.vendor} ({fmtR(topSupplier.total)})
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100">
                <CardContent className="py-4 px-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Deductible total</p>
                  <p className="text-2xl font-bold text-emerald-900 mt-1 tabular-nums">{fmtR(summary.deductibleTotal)}</p>
                  {/* TAX-B: YoY delta sub-line. */}
                  {yoyDelta && yoyDelta.pct != null && (
                    <p className={`text-[10px] mt-1 inline-flex items-center gap-0.5 ${
                      yoyDelta.pct > 5 ? "text-emerald-800" : yoyDelta.pct < -5 ? "text-rose-700" : "text-emerald-700/70"
                    }`}>
                      {yoyDelta.pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {yoyDelta.pct >= 0 ? "+" : ""}{yoyDelta.pct.toFixed(0)}% vs same window last year
                    </p>
                  )}
                  {yoyDelta && yoyDelta.pct == null && priorYearDeductible === 0 && (
                    <p className="text-[10px] text-emerald-700/70 mt-1">No comparable spend last year</p>
                  )}
                </CardContent>
              </Card>
              {/* TAX-B: VAT input claim tile. The actual rand amount
                  the operator can claim back from SARS. Often the
                  single most useful number on the page. */}
              <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
                <CardContent className="py-4 px-4">
                  <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">VAT input claim</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1 tabular-nums">{fmtR(summary.vatClaimableTotal)}</p>
                  <p className="text-[10px] text-blue-700/80 mt-1">
                    15/115 of standard-rated deductible spend
                  </p>
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

            {/* TAX-B: SARS-readiness card + sparkline trend. Gives
                the accountant a one-glance answer to "are we ready
                to file?" plus a 6-month view of deductible velocity. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
              <Card className={`border-0 shadow-sm ${
                sarsReadiness.color === "emerald" ? "bg-emerald-50/80"
                : sarsReadiness.color === "amber" ? "bg-amber-50/80"
                : sarsReadiness.color === "rose" ? "bg-rose-50/80"
                : ""
              }`}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs uppercase tracking-wide font-semibold text-slate-700 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> SARS-readiness
                    </p>
                    {sarsReadiness.score != null && (
                      <span className={`text-2xl font-bold tabular-nums ${
                        sarsReadiness.color === "emerald" ? "text-emerald-700"
                        : sarsReadiness.color === "amber" ? "text-amber-700"
                        : sarsReadiness.color === "rose" ? "text-rose-700"
                        : "text-slate-700"
                      }`}>
                        {sarsReadiness.score}%
                      </span>
                    )}
                  </div>
                  {sarsReadiness.score == null ? (
                    <p className="text-xs text-slate-500">No slips in this window yet.</p>
                  ) : (
                    <ul className="text-xs space-y-1">
                      <li className="flex items-center justify-between">
                        <span className="text-slate-600">Slips with lines</span>
                        <span className="tabular-nums font-medium">
                          {summary.receiptCount - summary.unfiledCount} / {summary.receiptCount}
                        </span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="text-slate-600">Reconcile mismatches</span>
                        <span className={`tabular-nums font-medium ${summary.mismatchCount > 0 ? "text-amber-700" : "text-slate-700"}`}>
                          {summary.mismatchCount}
                        </span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="text-slate-600">Rule overrides</span>
                        <span className={`tabular-nums font-medium ${summary.overrideCount > 0 ? "text-amber-700" : "text-slate-700"}`}>
                          {summary.overrideCount}
                        </span>
                      </li>
                      {oldestUnclassified && oldestUnclassified.receipt_date && (
                        <li className="text-[10px] text-amber-800 mt-1">
                          Oldest slip without lines: {new Date(oldestUnclassified.receipt_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}{oldestUnclassified.vendor ? ` (${oldestUnclassified.vendor})` : ""}
                        </li>
                      )}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs uppercase tracking-wide font-semibold text-slate-700 inline-flex items-center gap-1">
                      <CalendarIcon className="w-3.5 h-3.5" /> Deductible spend, last 6 months
                    </p>
                    <span className="text-[10px] text-slate-400">Independent of window above</span>
                  </div>
                  {sparkline.every((b) => b.total === 0) ? (
                    <p className="text-xs text-slate-500">No deductible spend in the last 6 months.</p>
                  ) : (
                    <div className="flex items-end gap-2 h-20">
                      {sparkline.map((b, i) => {
                        const max = Math.max(1, ...sparkline.map((x) => x.total));
                        const h = (b.total / max) * 100;
                        const isLast = i === sparkline.length - 1;
                        return (
                          <div key={b.key} className="flex-1 flex flex-col items-center gap-1" title={`${b.label}: ${fmtR(b.total)}`}>
                            <div className="flex-1 w-full flex items-end">
                              <div
                                className={`w-full rounded-t ${isLast ? "bg-emerald-600" : "bg-slate-300"}`}
                                style={{ height: `${Math.max(3, h)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500">{b.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {missingWeeks.length > 0 && (
                    <p className="text-[10px] text-amber-700 mt-2 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {missingWeeks.length} quiet week{missingWeeks.length === 1 ? "" : "s"} since {new Date(missingWeeks[0].weekStart).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} - check for missing slips
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* WINDOW PICKER */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Window</span>
                <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
                  {([
                    { id: "this_month",   label: "This month" },
                    { id: "this_quarter", label: "This quarter" },
                    { id: "this_year",    label: "Calendar year" },
                    // TAX-B: SA tax year (1 Mar - 28 Feb). What
                    // accountants actually file against.
                    { id: "tax_year",     label: "SA tax year" },
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
                {categoryFilter && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    className="ml-auto text-xs text-blue-700 hover:underline"
                  >
                    Clear category filter: {categoryFilter}
                  </button>
                )}
              </CardContent>
            </Card>

            {/* DEDUCTIBLE BREAKDOWN BY CATEGORY */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="py-4 px-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  Deductible spend by category
                  <span className="text-[10px] font-normal text-slate-400 ml-auto">Tap a category to filter slips</span>
                </h2>
                {loading ? (
                  <p className="text-xs text-slate-500">Loading...</p>
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
                        {deductibleByCategory.map((row) => {
                          const isSelected = categoryFilter === row.category;
                          return (
                            <tr
                              key={row.category}
                              className={`border-b border-slate-100 cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
                              onClick={() => setCategoryFilter(isSelected ? null : row.category)}
                            >
                              <td className="py-2 pr-3 text-slate-900">{row.category}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-600">{row.count}</td>
                              <td className="py-2 pl-3 text-right tabular-nums font-semibold text-emerald-700">{fmtR(row.total)}</td>
                            </tr>
                          );
                        })}
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

            {/* TAX-B: slip list. Expandable per-row with per-line
                drilldown so the accountant can audit without
                bouncing to /admin/shopping. */}
            <Card className="border-0 shadow-sm">
              <CardContent className="py-4 px-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-600" />
                  Slips in this window
                  {categoryFilter && (
                    <span className="text-[10px] font-normal text-blue-700 ml-2">
                      filtered: {categoryFilter}
                    </span>
                  )}
                </h2>
                {loading ? (
                  <p className="text-xs text-slate-500">Loading...</p>
                ) : visibleReceipts.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-600">
                      {categoryFilter
                        ? `No slips in this window have lines in ${categoryFilter}.`
                        : "No slips in this window yet."}
                    </p>
                    {!categoryFilter && (
                      <Link href={withSlug("/admin/shopping?tab=receipts")}>
                        <Button size="sm" variant="outline" className="gap-1.5 mt-2">
                          <ShoppingCart className="w-4 h-4" />
                          Add one on Shopping
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {visibleReceipts.map((r) => (
                      <SlipRow
                        key={r.id}
                        receipt={r}
                        isOpen={expanded.has(r.id)}
                        onToggle={() => toggleExpand(r.id)}
                        withSlug={withSlug}
                      />
                    ))}
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

/**
 * TAX-B: one slip row + per-line drilldown drawer. Expands inline
 * so the accountant can audit individual lines without leaving the
 * page. Edits still happen on /admin/shopping (via "Fix on Shopping"
 * deep-link per line - kept read-only here on purpose).
 *
 * Renders desktop-friendly inline; mobile (<sm) falls back to a
 * stacked card layout via the responsive utility classes.
 */
function SlipRow({
  receipt: r, isOpen, onToggle, withSlug,
}: {
  receipt: ReceiptWithItems;
  isOpen: boolean;
  onToggle: () => void;
  withSlug: (path: string) => string;
}) {
  const itemsTotal = r.deductibleTotal + r.nonDeductibleTotal;
  const slipTotal = Number(r.total ?? 0);
  const drift = slipTotal > 0 ? itemsTotal - slipTotal : 0;
  const driftBig = slipTotal > 0 && Math.abs(drift) > slipTotal * 0.05 && Math.abs(drift) > 1;
  const driftSign = drift > 0 ? "+" : "";
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 py-2 text-left hover:bg-slate-50 rounded-md px-1"
      >
        <span className="text-slate-400 shrink-0">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
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
            {/* TAX-B: drift magnitude on the badge, not just a
                generic "mismatch" label. */}
            {driftBig && (
              <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px]">
                Lines mismatch ({driftSign}{fmtR(Math.abs(drift))})
              </Badge>
            )}
            {r.overrideCount > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">
                {r.overrideCount} override{r.overrideCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          {/* TAX-B: stacked rand line on mobile, inline on sm+. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-slate-600 mt-0.5">
            {r.total != null && <span>Slip: <span className="font-medium text-slate-900">{fmtR(r.total)}</span></span>}
            <span className="text-emerald-700">Deductible: <span className="font-medium">{fmtR(r.deductibleTotal)}</span></span>
            {r.vatClaimableTotal > 0 && (
              <span className="text-blue-700">VAT: <span className="font-medium">{fmtR(r.vatClaimableTotal)}</span></span>
            )}
            {r.nonDeductibleTotal > 0 && (
              <span className="text-slate-500">Non-ded: <span className="font-medium">{fmtR(r.nonDeductibleTotal)}</span></span>
            )}
          </div>
        </div>
        {r.image_url && (
          <a
            href={r.image_url}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-600 hover:underline shrink-0 hidden sm:inline"
          >
            View slip
          </a>
        )}
      </button>

      {isOpen && (
        <div className="px-2 sm:px-10 pb-3 pt-1">
          {r.items.length === 0 ? (
            <div className="text-xs text-slate-500 italic flex items-center justify-between gap-2 py-2">
              <span>No lines extracted yet.</span>
              <Link
                href={withSlug(`/admin/shopping?tab=receipts&receipt=${r.id}`)}
                className="text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                Add lines on Shopping <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-1.5 pr-2">Item</th>
                    <th className="text-left py-1.5 px-2 hidden sm:table-cell">Category</th>
                    <th className="text-right py-1.5 px-2">Amount</th>
                    <th className="text-center py-1.5 px-2">Deductible</th>
                    <th className="text-right py-1.5 px-2 hidden sm:table-cell">VAT</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((it) => (
                    <LineRow key={it.id} item={it} receiptId={r.id} withSlug={withSlug} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * TAX-B: per-line row in the drilldown. Renders the amber override
 * badge when is_deductible disagrees with rule.deductibility =
 * 'non_deductible', and a "Fix on Shopping" deep-link icon.
 */
function LineRow({
  item: it, receiptId, withSlug,
}: {
  item: PurchaseReceiptItem;
  receiptId: string;
  withSlug: (path: string) => string;
}) {
  const isOverride = it.is_deductible && it.rule?.deductibility === "non_deductible";
  const vatClaim =
    it.is_deductible && it.rule?.vat_input_claimable === "claimable"
      ? (Number(it.amount) || 0) * 15 / 115
      : 0;
  return (
    <tr className="border-b border-slate-50 last:border-b-0">
      <td className="py-1.5 pr-2 text-slate-900 align-top">
        <div className="truncate" title={it.description}>{it.description}</div>
        {isOverride && (
          <div className="mt-0.5">
            <Badge className="bg-amber-100 text-amber-800 border-0 text-[9px]" title={`Rule says ${it.rule?.display_name || it.category} is non-deductible (e.g. ITA s23). SARS may disallow.`}>
              Override of non-deductible rule
            </Badge>
          </div>
        )}
      </td>
      <td className="py-1.5 px-2 text-slate-600 hidden sm:table-cell">
        {it.category || "—"}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums">{fmtR(it.amount)}</td>
      <td className="py-1.5 px-2 text-center">
        {it.is_deductible ? (
          <span className="text-emerald-700 font-medium">Yes</span>
        ) : (
          <span className="text-slate-400">No</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-blue-700 hidden sm:table-cell">
        {vatClaim > 0 ? fmtR(vatClaim) : <span className="text-slate-300">—</span>}
      </td>
      <td className="py-1.5 pl-2 text-right">
        {/* TAX-B: per-line "Fix on Shopping" deep-link. Lands the
            operator on the receipts tab with the slip auto-expanded. */}
        <Link
          href={withSlug(`/admin/shopping?tab=receipts&receipt=${receiptId}`)}
          title="Edit this line on the Shopping dashboard"
          className="inline-flex items-center text-blue-600 hover:text-blue-800"
        >
          <Pencil className="w-3 h-3" />
        </Link>
      </td>
    </tr>
  );
}

export default function ProtectedTaxPurchasesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN]}>
      <TaxPurchasesPage />
    </ProtectedRoute>
  );
}
