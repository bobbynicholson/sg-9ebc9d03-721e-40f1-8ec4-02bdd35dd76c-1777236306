import { protectedCompanyFileUrl } from "@/lib/companyFiles";
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
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt, Download, FileText, ShoppingCart, ExternalLink, AlertTriangle,
  Calendar as CalendarIcon, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  ShieldCheck, Pencil, ArrowRight, Eye,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_TENANT_TIMEZONE, tenantToday, toLocalISO } from "@/lib/localDate";
import { formatZAR } from "@/lib/formatters";
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

// Money display goes through formatZAR (the platform-wide money
// formatter); this page keeps its "-" null fallback for empty cells.
const fmtR = (v?: number | null) => (v == null ? "-" : formatZAR(v));

type WindowKind = "this_month" | "this_quarter" | "this_year" | "tax_year" | "all";

// Window boundaries anchor on the TENANT's calendar day (passed in by
// the page), not the operator's browser clock - "This month" on the
// 1st shouldn't include the old month for a bookkeeper west of the
// tenant's timezone.
function dateRangeFor(window: WindowKind, now: Date): { from?: string; to?: string } {
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
function priorYearRangeFor(window: WindowKind, now: Date): { from?: string; to?: string } {
  if (window === "all") return {};
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
  const [loadError, setLoadError] = useState<string | null>(null);
  // Start with the full ledger so an empty current month doesn't make
  // the accountant view look like purchases were never recorded.
  const [windowKind, setWindowKind] = useState<WindowKind>("all");
  // TAX-B: prior-year deductible total for the YoY delta. NULL =
  // not loaded yet / "all time" (which has no comparison window).
  const [priorYearDeductible, setPriorYearDeductible] = useState<number | null>(null);
  const [priorYearError, setPriorYearError] = useState(false);
  // TAX-B: a longer-window pull (180 days) feeds the sparkline and
  // missing-slip detection. Independent of the visible window so the
  // operator can flip "This month" without losing the trend chart.
  const [longRangeReceipts, setLongRangeReceipts] = useState<ReceiptWithItems[]>([]);
  const [longRangeError, setLongRangeError] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Window maths anchors on the tenant's calendar day (companies.
  // timezone), not the operator's browser clock.
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("companies")
        .select("timezone")
        .eq("id", companyId)
        .maybeSingle();
      if (!cancelled) setTenantTimezone((data as any)?.timezone || DEFAULT_TENANT_TIMEZONE);
    })();
    return () => { cancelled = true; };
  }, [companyId]);
  const dayAnchor = useMemo(
    () => tenantToday(tenantTimezone || DEFAULT_TENANT_TIMEZONE),
    [tenantTimezone],
  );

  // Visible-window receipts.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const range = dateRangeFor(windowKind, dayAnchor);
        const list = await listForCompany({ companyId, fromDate: range.from, toDate: range.to });
        if (!cancelled) setReceipts(list);
      } catch (e: any) {
        captureException(e, {
          tags: { route: "/admin/tax-purchases", step: "load-receipts", companyId },
        });
        if (!cancelled) {
          // Audit: pre-fix a failed pull rendered as zero tiles and an
          // empty slip list under a one-shot toast. Keep an on-page
          // error state so the failure stays visible.
          setLoadError(e?.message || "Could not load slips. Check your connection and retry.");
          setReceipts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, windowKind, refreshTick, dayAnchor]);

  // TAX-B: prior-year same-window pull. Cheap (no joins beyond what
  // listForCompany already does) so it runs on every window change.
  useEffect(() => {
    if (!companyId) return;
    if (windowKind === "all") { setPriorYearDeductible(null); setPriorYearError(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const range = priorYearRangeFor(windowKind, dayAnchor);
        const list = await listForCompany({ companyId, fromDate: range.from, toDate: range.to });
        if (!cancelled) {
          setPriorYearDeductible(list.reduce((s, r) => s + r.deductibleTotal, 0));
          setPriorYearError(false);
        }
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/tax-purchases", step: "load-prior-year", companyId },
        });
        if (!cancelled) { setPriorYearDeductible(null); setPriorYearError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, windowKind, refreshTick, dayAnchor]);

  // TAX-B: 180-day pull for the sparkline + missing-slip detector.
  // Runs once per mount per tenant + on realtime bumps.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(dayAnchor);
        since.setDate(since.getDate() - 180);
        const list = await listForCompany({ companyId, fromDate: toLocalISO(since) });
        if (!cancelled) { setLongRangeReceipts(list); setLongRangeError(false); }
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/tax-purchases", step: "load-long-range", companyId },
        });
        if (!cancelled) { setLongRangeReceipts([]); setLongRangeError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshTick, dayAnchor]);

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
  const pendingReviewLineCount = useMemo(
    () => receipts.reduce((count, receipt) => count + receipt.draftItems.length, 0),
    [receipts],
  );
  const ruleExcludedLineCount = useMemo(
    () => receipts.reduce((count, receipt) => count + receipt.confirmedItems.filter(
      (item) => !item.is_deductible && item.rule?.deductibility !== "non_deductible",
    ).length, 0),
    [receipts],
  );
  const receiptsToReview = useMemo(
    () => receipts.filter((receipt) => receipt.confirmedItems.length === 0 || receipt.draftItems.length > 0).length,
    [receipts],
  );

  // Internal tax-record completeness estimate. This is not a SARS
  // score: it summarizes unresolved slips, reconciliations and overrides.
  const sarsReadiness = useMemo(() => {
    if (summary.receiptCount === 0) {
      return { score: null as number | null, color: "slate" as const };
    }
    let score = 100;
    score -= (receiptsToReview / summary.receiptCount) * 60; // unresolved slips are not yet claimable
    score -= (summary.mismatchCount / summary.receiptCount) * 25;
    // overrides scale by lines, not receipts - one override on a big
    // slip is bigger trouble than three on tiny ones, but we don't
    // know total lines here so flat penalty.
    if (summary.overrideCount > 0) score -= Math.min(15, summary.overrideCount * 5);
    if (ruleExcludedLineCount > 0) score -= Math.min(15, ruleExcludedLineCount * 5);
    score = Math.max(0, Math.round(score));
    const color = score >= 85 ? "emerald" : score >= 60 ? "amber" : "rose";
    return { score, color } as const;
  }, [summary, receiptsToReview, ruleExcludedLineCount]);

  // TAX-B: oldest slip still without lines. Surfaces in SARS card.
  const oldestUnclassified = useMemo(() => {
    return receipts
      .filter((r) => r.confirmedItems.length === 0 || r.draftItems.length > 0)
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
  // Accumulates in integer CENTS (floats drift over long lists);
  // totalCents / 100 only at display.
  const deductibleByCategory = useMemo(() => {
    const map = new Map<string, { count: number; totalCents: number }>();
    for (const r of receipts) {
      for (const it of r.confirmedItems) {
        if (!it.is_deductible) continue;
        const key = (it.category || "").trim() || "Uncategorised";
        const cur = map.get(key) || { count: 0, totalCents: 0 };
        cur.count += 1;
        cur.totalCents += Math.round((Number(it.amount) || 0) * 100);
        map.set(key, cur);
      }
    }
    return [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [receipts]);

  // Top supplier by printed receipt total (not the deductible subset).
  // Cents for the same reason as the category rollup above.
  const topSupplier = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of receipts) {
      const key = (r.vendor || "Unnamed").trim();
      const receiptCents = Math.round((Number(r.total) || 0) * 100);
      if (receiptCents > 0) map.set(key, (map.get(key) || 0) + receiptCents);
    }
    const top = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? { vendor: top[0], totalCents: top[1] } : null;
  }, [receipts]);

  // TAX-B: visible-slips filter when a category row is selected.
  const visibleReceipts = useMemo(() => {
    if (!categoryFilter) return receipts;
    return receipts.filter((r) =>
      r.confirmedItems.some((it) => it.is_deductible && (it.rule?.display_name || it.category || "Uncategorised") === categoryFilter),
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
    if (pendingReviewLineCount > 0) {
      toast({
        title: "Export created with pending lines excluded",
        description: `${pendingReviewLineCount} unconfirmed scan line${pendingReviewLineCount === 1 ? " was" : "s were"} not included in deductible totals. Review them in Shopping receipts before filing.`,
      });
    }
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
      <Head><title>Tax overview - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Tax overview"
            icon={Receipt}
            subtitle="Review recorded deductible purchases for your accountant."
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {summary.receiptCount} slip{summary.receiptCount === 1 ? "" : "s"} in window
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    {fmtR(summary.deductibleTotal)} deductible
                  </span>
                  {summary.vatClaimableTotal > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90">
                      {fmtR(summary.vatClaimableTotal)} estimated VAT input
                    </span>
                  )}
                  {pendingReviewLineCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/30 bg-amber-300/15 px-2.5 py-1 text-xs font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                      {pendingReviewLineCount} scan line{pendingReviewLineCount === 1 ? "" : "s"} to review
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <div className="flex w-full items-center justify-end gap-2 xl:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  className="h-11 w-11 justify-center gap-1.5 p-0 sm:h-9 sm:w-auto sm:px-3"
                  disabled={receipts.length === 0}
                  aria-label="Export tax purchases CSV"
                  title="Export tax purchases CSV"
                >
                  <Download className="w-4 h-4" />
                  <span className="sr-only sm:not-sr-only">Export CSV</span>
                </Button>
                <Link
                  href={withSlug("/admin/shopping?tab=receipts")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-brand-primary p-0 text-sm font-medium text-white transition-colors hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3"
                  aria-label="Manage purchase receipts"
                  title="Manage receipts"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">Manage receipts</span>
                </Link>
              </div>
            }
          />
          <PageWorkbench />

            {/* Load failure: loud recovery card instead of a page of
                fake-zero tiles over an empty slip list. */}
            {loadError && (
              <Card className="mb-4 border-rose-200">
                <CardContent className="py-4 px-4">
                  <h2 className="text-base font-bold text-rose-900 mb-1">Couldn&apos;t load the tax overview</h2>
                  <p className="text-sm text-slate-600 mb-3">{loadError}</p>
                  <Button
                    size="sm"
                    className="bg-brand-primary hover:bg-brand-primary/90"
                    onClick={() => setRefreshTick((n) => n + 1)}
                    disabled={loading}
                  >
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* WINDOW PICKER - stays mounted through reloads (it is
                what triggers them), so it lives above the loading
                gate. */}
            {!loadError && (
            <Card className="mb-4">
              <CardContent className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
                <span className="text-sm font-semibold text-slate-600">Window</span>
                <label htmlFor="tax-purchase-window" className="sr-only">Report window</label>
                <select
                  id="tax-purchase-window"
                  value={windowKind}
                  onChange={(e) => setWindowKind(e.target.value as WindowKind)}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 sm:hidden"
                >
                  <option value="this_month">This month</option>
                  <option value="this_quarter">This quarter</option>
                  <option value="this_year">Calendar year</option>
                  <option value="tax_year">SA tax year</option>
                  <option value="all">All time</option>
                </select>
                <div className="hidden flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm sm:flex">
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
                      className={`min-h-10 rounded-md px-3 py-2 ${
                        windowKind === t.id
                          ? "bg-brand-primary text-white font-medium"
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
                    className="min-h-10 w-full text-left text-sm text-blue-700 hover:underline sm:ml-auto sm:w-auto sm:text-right"
                  >
                    Clear category filter: {categoryFilter}
                  </button>
                )}
              </CardContent>
            </Card>
            )}

            {/* Loading skeleton INSIDE the shell: pre-fix the summary
                strip and SARS card rendered live off an empty receipts
                array during the fetch, so the page flashed a wall of
                confident zeros ("0 slips", "R0 deductible", "No slips
                in this window yet") before the real figures landed. */}
            {!loadError && loading && (
              <div aria-hidden="true">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardContent className="py-4 px-4">
                        <div className="h-3 w-20 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
                        <div className="mt-2 h-7 w-24 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                  {[0, 1].map((i) => (
                    <Card key={i} className={i === 1 ? "lg:col-span-2" : undefined}>
                      <CardContent className="py-4 px-4">
                        <div className="h-3 w-28 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
                        <div className="mt-3 h-16 w-full rounded bg-slate-100 animate-pulse dark:bg-slate-800" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {!loadError && !loading && (
            <>
            {/* TAX-B: page-level mismatch + override banner. Promotes
                the per-slip rose chip to a louder warning so the
                accountant sees it before exporting. */}
            {(summary.mismatchCount > 0 || summary.overrideCount > 0 || pendingReviewLineCount > 0 || ruleExcludedLineCount > 0) && (
              <Card className="bg-amber-50 border-l-4 border-l-amber-500 mb-4">
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
                      {pendingReviewLineCount > 0 && (
                        <li>
                          {pendingReviewLineCount} extracted line{pendingReviewLineCount === 1 ? " is" : "s are"} still awaiting confirmation. These amounts are excluded from deductible totals until reviewed.
                        </li>
                      )}
                      {ruleExcludedLineCount > 0 && (
                        <li>
                          {ruleExcludedLineCount} confirmed line{ruleExcludedLineCount === 1 ? " is" : "s are"} marked non-deductible even though the selected tax rule allows a deduction. Check whether that choice was intentional.
                        </li>
                      )}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* WHERE-TO-EDIT BANNER */}
            <p className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
              This page is read-only. Add and edit slips on{" "}
              <Link href={withSlug("/admin/shopping?tab=receipts")} className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline">
                Shopping receipts <ExternalLink className="h-3 w-3" />
              </Link>
            </p>

            {/* SUMMARY STRIP */}
            <div className="mb-4 grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <Card>
                <CardContent className="p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Slips logged</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{summary.receiptCount}</p>
                    </div>
                    <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <FileText className="h-4 w-4" />
                    </span>
                  </div>
                  {topSupplier && (
                      <p className="mt-1 truncate text-[11px] text-slate-500" title={`Top supplier by receipt total: ${topSupplier.vendor}`}>
                      Top supplier by slip value: {topSupplier.vendor} ({fmtR(topSupplier.totalCents / 100)})
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10">
                <CardContent className="p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">Deductible total</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-brand-primary sm:text-xl">{fmtR(summary.deductibleTotal)}</p>
                    </div>
                    <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Receipt className="h-4 w-4" />
                    </span>
                  </div>
                  {/* TAX-B: YoY delta sub-line. */}
                  {yoyDelta && yoyDelta.pct != null && (
                    <p className={`mt-1 inline-flex items-center gap-1 text-[11px] ${
                      yoyDelta.pct > 5 ? "text-brand-primary" : yoyDelta.pct < -5 ? "text-rose-700" : "text-brand-primary/70"
                    }`}>
                      {yoyDelta.pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {yoyDelta.pct >= 0 ? "+" : ""}{yoyDelta.pct.toFixed(0)}% vs same window last year
                    </p>
                  )}
                  {yoyDelta && yoyDelta.pct == null && priorYearDeductible === 0 && (
                    <p className="mt-1 text-[11px] text-brand-primary/70">No comparable spend last year</p>
                  )}
                  {/* Surface a failed prior-year pull instead of
                      silently hiding the YoY line. */}
                  {priorYearError && (
                    <p className="mt-1 text-[11px] text-amber-700">YoY comparison unavailable (last year&apos;s pull failed)</p>
                  )}
                </CardContent>
              </Card>
              {/* TAX-B: VAT input claim tile. The actual rand amount
                  the operator can claim back from SARS. Often the
                  single most useful number on the page. */}
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
                <CardContent className="p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Estimated VAT input</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-blue-900 sm:text-xl">{fmtR(summary.vatClaimableTotal)}</p>
                    </div>
                    <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-700">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-blue-700/80">15/115 estimate for confirmed eligible lines. Slip VAT is shown separately.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Non-deductible</p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">{fmtR(summary.nonDeductibleTotal)}</p>
                    </div>
                    <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card className={`${receiptsToReview > 0 ? "bg-amber-50" : ""}`}>
                <CardContent className="p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold uppercase tracking-wide ${receiptsToReview > 0 ? "text-amber-700" : "text-slate-500"}`}>Slips to review</p>
                      <p className={`mt-1 text-xl font-bold tabular-nums ${receiptsToReview > 0 ? "text-amber-900" : "text-slate-900"}`}>
                        {receiptsToReview}
                      </p>
                    </div>
                    <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                      <Pencil className="h-4 w-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* TAX-B: SARS-readiness card + sparkline trend. Gives
                the accountant a one-glance answer to "are we ready
                to file?" plus a 6-month view of deductible velocity. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
              <Card className={`${
                sarsReadiness.color === "emerald" ? "bg-brand-primary/10"
                : sarsReadiness.color === "amber" ? "bg-amber-50/80"
                : sarsReadiness.color === "rose" ? "bg-rose-50/80"
                : ""
              }`}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs uppercase tracking-wide font-semibold text-slate-700 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Tax record readiness
                    </p>
                    {sarsReadiness.score != null && (
                      <span className={`text-xl font-bold tabular-nums ${
                        sarsReadiness.color === "emerald" ? "text-brand-primary"
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
                    <>
                      <p className="mb-2 text-xs leading-4 text-slate-500">Internal completeness estimate from slips to review, line mismatches and rule overrides.</p>
                      <ul className="text-xs space-y-1">
                      <li className="flex items-center justify-between">
                        <span className="text-slate-600">Slips with lines</span>
                        <span className="tabular-nums font-medium">
                          {Math.max(0, summary.receiptCount - receiptsToReview)} / {summary.receiptCount}
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
                        <li className="mt-1 text-[11px] leading-4 text-amber-800">
                          Oldest slip needing review: {new Date(oldestUnclassified.receipt_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}{oldestUnclassified.vendor ? ` (${oldestUnclassified.vendor})` : ""}
                        </li>
                      )}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs uppercase tracking-wide font-semibold text-slate-700 inline-flex items-center gap-1">
                      <CalendarIcon className="w-3.5 h-3.5" /> Deductible spend, last 6 months
                    </p>
                    <span className="text-[11px] text-slate-500">Independent of window above</span>
                  </div>
                  {longRangeError ? (
                    // Distinguish "pull failed" from a genuinely quiet
                    // 6 months - pre-audit both rendered the same line.
                    <p className="text-xs text-amber-700">
                      Couldn&apos;t load the trend.{" "}
                      <button type="button" className="underline" onClick={() => setRefreshTick((n) => n + 1)}>
                        Retry
                      </button>
                    </p>
                  ) : sparkline.every((b) => b.total === 0) ? (
                    <p className="text-xs text-slate-500">No confirmed deductible lines in the last 6 months. Slips awaiting review are excluded.</p>
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
                                className={`w-full rounded-t ${isLast ? "bg-brand-primary" : "bg-slate-300"}`}
                                style={{ height: `${Math.max(3, h)}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-500">{b.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {missingWeeks.length > 0 && (
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] leading-4 text-amber-700">
                      <AlertTriangle className="w-3 h-3" />
                      {missingWeeks.length} quiet week{missingWeeks.length === 1 ? "" : "s"} since {new Date(missingWeeks[0].weekStart).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} - check for missing slips
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* DEDUCTIBLE BREAKDOWN BY CATEGORY */}
            <Card className="mb-4">
              <CardContent className="py-4 px-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-primary" />
                  Deductible spend by category
                  <span className="ml-auto text-[11px] font-normal text-slate-500">Tap a category to filter slips</span>
                </h2>
                {loading ? (
                  <p className="text-xs text-slate-500">Loading...</p>
                ) : deductibleByCategory.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No confirmed deductible lines in this window yet. Review any pending scan lines and check whether non-deductible choices match the receipt.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
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
                              <td className="py-2 pl-3 text-right tabular-nums font-semibold text-brand-primary">{fmtR(row.totalCents / 100)}</td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td className="py-2 pr-3 font-semibold text-slate-900">Total deductible</td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-600">
                            {deductibleByCategory.reduce((s, r) => s + r.count, 0)}
                          </td>
                          {/* Sum of the category rows above (cents), so
                              the table always internally reconciles. In
                              practice it equals summary.deductibleTotal
                              on the tile - both roll up the same lines. */}
                          <td className="py-2 pl-3 text-right tabular-nums font-bold text-brand-primary">
                            {fmtR(deductibleByCategory.reduce((s, r) => s + r.totalCents, 0) / 100)}
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
            <Card>
              <CardContent className="py-4 px-4">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-brand-primary" />
                  Slips in this window
                  {categoryFilter && (
                    <span className="ml-2 text-[11px] font-normal text-blue-700">
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
                      <Link href={withSlug("/admin/shopping?tab=receipts")} className="text-xs text-brand-primary hover:text-brand-primary inline-flex items-center gap-1 font-semibold">
                        Edit any of these on the Shopping dashboard <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </>
            )}

        </PortalShell>

        <Footer />
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
  const draftTotal = r.draftItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const slipTotal = Number(r.total ?? 0);
  const drift = slipTotal > 0 ? itemsTotal - slipTotal : 0;
  const driftBig = r.confirmedItems.length > 0 && r.draftItems.length === 0 && slipTotal > 0 && Math.abs(drift) > slipTotal * 0.05 && Math.abs(drift) > 1;
  const driftSign = drift > 0 ? "+" : "";
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-50"
        >
          <span className="shrink-0 text-slate-400">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          {r.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={protectedCompanyFileUrl(r.image_url)} alt="" className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50">
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-slate-900">
                {r.vendor || "Untitled vendor"}
              </p>
              {r.receipt_date && (
                <span className="text-xs text-slate-500">
                  {new Date(r.receipt_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                </span>
              )}
              {r.draftItems.length > 0 ? (
                <Badge className="border-0 bg-amber-100 text-[11px] text-amber-800">
                  {r.draftItems.length} line{r.draftItems.length === 1 ? "" : "s"} to review
                </Badge>
              ) : r.items.length === 0 && (
                <Badge className="border-0 bg-amber-100 text-[11px] text-amber-800">No lines yet</Badge>
              )}
              {/* TAX-B: drift magnitude on the badge, not just a
                  generic "mismatch" label. */}
              {driftBig && (
                <Badge className="border-0 bg-rose-100 text-[11px] text-rose-800">
                  Lines mismatch ({driftSign}{fmtR(Math.abs(drift))})
                </Badge>
              )}
              {r.overrideCount > 0 && (
                <Badge className="border-0 bg-amber-100 text-[11px] text-amber-800">
                  {r.overrideCount} override{r.overrideCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            {/* TAX-B: stacked rand line on mobile, inline on sm+. */}
            <div className="mt-0.5 flex flex-col gap-1 text-xs text-slate-600 sm:flex-row sm:items-center sm:gap-3">
              {r.total != null && <span>Slip: <span className="font-medium text-slate-900">{fmtR(r.total)}</span></span>}
              {r.scan_result?.subtotal != null && <span>Subtotal: <span className="font-medium text-slate-900">{fmtR(r.scan_result.subtotal)}</span></span>}
              {r.scan_result?.vat != null && <span>Slip VAT: <span className="font-medium text-slate-900">{fmtR(r.scan_result.vat)}</span></span>}
              <span className="text-brand-primary">Deductible: <span className="font-medium">{fmtR(r.deductibleTotal)}</span></span>
              {r.vatClaimableTotal > 0 && (
                <span className="text-blue-700">Input VAT est.: <span className="font-medium">{fmtR(r.vatClaimableTotal)}</span></span>
              )}
              {r.nonDeductibleTotal > 0 && (
                <span className="text-slate-500">Non-ded: <span className="font-medium">{fmtR(r.nonDeductibleTotal)}</span></span>
              )}
              {draftTotal > 0 && (
                <span className="font-medium text-amber-700">To review: {fmtR(draftTotal)}</span>
              )}
            </div>
          </div>
        </button>
        {r.image_url && (
          <a
            href={protectedCompanyFileUrl(r.image_url)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Show receipt slip${r.vendor ? ` for ${r.vendor}` : ""}`}
            title="Show receipt slip"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:h-9 sm:w-auto sm:gap-2 sm:px-3"
          >
            <Eye className="h-4 w-4" />
            <span className="text-xs font-medium sm:text-sm">Show</span>
          </a>
        )}
      </div>

      {isOpen && (
        <div className="px-2 pb-3 pt-1 sm:px-10">
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
            <>
            {r.draftItems.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <span>
                  {r.draftItems.length} extracted line{r.draftItems.length === 1 ? " is" : "s are"} awaiting confirmation ({fmtR(draftTotal)}). Pending lines do not count toward deductible totals yet.
                </span>
                <Link
                  href={withSlug(`/admin/shopping?tab=receipts&receipt=${r.id}`)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-md border border-amber-300 bg-white px-3 font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Review lines <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
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
                    <LineRow key={it.id} item={it} isDraft={it.is_draft === true} receiptId={r.id} withSlug={withSlug} />
                  ))}
                </tbody>
              </table>
            </div>
            </>
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
  item: it, isDraft, receiptId, withSlug,
}: {
  item: PurchaseReceiptItem;
  isDraft: boolean;
  receiptId: string;
  withSlug: (path: string) => string;
}) {
  const isOverride = it.is_deductible && it.rule?.deductibility === "non_deductible";
  const ruleExcludesSuggestedDeduction = !isDraft && !it.is_deductible &&
    (it.rule?.deductibility === "deductible" || it.rule?.deductibility === "partial");
  // 15/115 VAT back-out, computed on integer cents then rounded so
  // the displayed claim is a real money value, not a float tail.
  const vatClaim =
    !isDraft && it.is_deductible && it.rule?.vat_input_claimable === "claimable"
      ? Math.round(Math.round((Number(it.amount) || 0) * 100) * 15 / 115) / 100
      : 0;
  return (
    <tr className="border-b border-slate-50 last:border-b-0">
      <td className="py-1.5 pr-2 text-slate-900 align-top">
        <div className="truncate" title={it.description}>{it.description}</div>
        {isOverride && (
          <div className="mt-0.5">
            <Badge className="border-0 bg-amber-100 text-[11px] text-amber-800" title={`Rule says ${it.rule?.display_name || it.category} is non-deductible (e.g. ITA s23). SARS may disallow.`}>
              Override of non-deductible rule
            </Badge>
          </div>
        )}
        {isDraft && (
          <div className="mt-1">
            <Badge className="border-0 bg-amber-100 text-[11px] text-amber-800">Pending review</Badge>
          </div>
        )}
        {ruleExcludesSuggestedDeduction && (
          <div className="mt-1">
            <Badge className="border border-amber-300 bg-amber-50 text-[11px] text-amber-900" title="The selected rule allows a deduction, but this line is currently excluded from deductible totals.">
              Rule allows deduction — check this line
            </Badge>
          </div>
        )}
      </td>
      <td className="py-1.5 px-2 text-slate-600 hidden sm:table-cell">
        {it.rule?.display_name || it.category || "-"}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums">{fmtR(it.amount)}</td>
      <td className="py-1.5 px-2 text-center">
        {isDraft ? (
          <Badge className="border-0 bg-amber-100 text-[11px] text-amber-800">Pending</Badge>
        ) : it.is_deductible ? (
          <span className="text-brand-primary font-medium">Yes</span>
        ) : (
          <span className="text-slate-400">No</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-blue-700 hidden sm:table-cell">
        {vatClaim > 0 ? fmtR(vatClaim) : <span className="text-slate-300">-</span>}
      </td>
      <td className="py-1.5 pl-2 text-right">
        {/* TAX-B: per-line "Fix on Shopping" deep-link. Lands the
            operator on the receipts tab with the slip auto-expanded. */}
        <Link
          href={withSlug(`/admin/shopping?tab=receipts&receipt=${receiptId}`)}
          title="Edit this line on the Shopping dashboard"
          aria-label="Edit this line on the Shopping dashboard"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}

export default function ProtectedTaxPurchasesPage() {
  return (
    // Deliberately finance-gated: UserRole.ADMIN covers region_admin +
    // sales_admin, who must not see company-wide deductible spend and
    // VAT claim figures. Follows the canAccessFinance convention used
    // by /admin/wages and /admin/staff-hours.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN]}>
      <TaxPurchasesPage />
    </ProtectedRoute>
  );
}
