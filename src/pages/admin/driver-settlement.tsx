/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/driver-settlement - per-driver pay summary for the admin.
 *
 * Lists every active driver in the company with their pay breakdown
 * for a selected period: hourly pay (from driver_shifts), distance
 * pay (from delivered orders' delivery_distance_km), callout pay
 * (flat per delivery). Sums to the grand total.
 *
 * Source of truth: driverPayService.getPaySummary - same calc the
 * driver's own /team-portal/driver/earnings page uses, so admin and
 * driver always see the same numbers.
 *
 * Stage 3 of the driver hourly-rate build. Stage 4 adds auto
 * clock-in / clock-out + BCEA multipliers, which feed straight into
 * this view via the same path (multiplier already in the calc).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
  StatTile,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet, Loader2, Download, Clock, Route, MapPin, ChevronDown, ChevronRight, RefreshCw,
  Pencil, Trash2, Check, CircleCheck, CircleDashed, BadgeCheck,
  TrendingUp, TrendingDown, Moon, AlertTriangle, CheckCheck,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { captureException } from "@/lib/observability";
import {
  driverPayService,
  type DriverPaySummary,
} from "@/services/driverPayService";
import {
  driverPayoutService,
  type DriverPayoutRow,
  type DriverPayoutMethod,
} from "@/services/driverPayoutService";

// TIGHTEN I.107 (2026-06-02): module-scope formatR retained as the
// fallback that sibling components fall back to when the main page
// doesn't pass a tenant-aware override. FragmentRows +
// DriverSettlementCard now accept a `fmt` prop; main page builds it
// from useTenantCurrency and passes through. The result: all 5
// components on this page render in the tenant currency.
const formatRDefault = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

type Preset = "last_7" | "last_30" | "month_to_date" | "last_month" | "custom";

function todayIso() { return toLocalISO(new Date()); }
function daysAgoIso(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return toLocalISO(dt);
}
function startOfMonthIso() {
  const d = new Date();
  return toLocalISO(new Date(d.getFullYear(), d.getMonth(), 1));
}
function lastMonthRange(): { from: string; to: string } {
  const d = new Date();
  const firstOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 86400000);
  const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
  return {
    from: toLocalISO(firstOfPrev),
    to: toLocalISO(lastOfPrev),
  };
}

interface DriverRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  /** Soft-deleted via /admin/driver-management remove. We still show
   *  them in settlement because their historical pay is real and the
   *  operator may need to pay it out. Surfaced with a "Removed" badge. */
  is_removed: boolean;
}

interface SettlementRow {
  driver: DriverRow;
  summary: DriverPaySummary | null;
  loading: boolean;
}

interface DriverPayslipCompanyProfile {
  companyName: string;
  companyLegalName?: string | null;
  companyAddress?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyWebsite?: string | null;
  companyRegistrationNumber?: string | null;
  companyTaxNumber?: string | null;
  companyVatNumber?: string | null;
  companyVatRegistered?: boolean | null;
  companyLogoUrl?: string | null;
  companyBrandColor?: string | null;
}

export default function ProtectedDriverSettlementPage() {
  // Pay-data privacy: tightened to COMPANY_ADMIN+ to match the
  // canAccessFinance gate on the Wages section in AdminNav.
  // DRV-C (task #216, 2026-05-25): OWNER persona was being bounced
  // off their own settlement page even though OWNER is in
  // FULL_COMPANY_ACCESS_ROLES (authGuards.ts line 147-151).
  // Admitting OWNER + ADMIN brings the gate back in line with
  // canAccessFinance.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]} denyRoles={[UserRole.SUPER_ADMIN]}>
      <DriverSettlementPage />
    </ProtectedRoute>
  );
}

function DriverSettlementPage() {
  const { user } = useAuth() as any;
  // TIGHTEN I.84: tenant-aware money formatter (2dp to match prior).
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  const formatR = (n: number) => tenantCurrency.format(n, 2);
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const router = useRouter();
  // DRV-B: scope drivers by the global region filter when active.
  // profiles.region_id has been backfilled and NOT NULL since
  // 20260523150000_profiles_region_id_backfill_and_default - so we
  // can rely on it being present. Pass NULL through too so a driver
  // who hasn't been region-tagged still surfaces.
  const { regionFilterId } = useRegionFilter();

  const [preset, setPreset] = useState<Preset>("last_30");
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  // Command-centre audit: persist the driver-list load failure so the
  // page shows a Retry card instead of the misleading "No drivers
  // configured yet" empty state. loadTick re-arms the fetch effect.
  const [driversError, setDriversError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [companyProfile, setCompanyProfile] = useState<DriverPayslipCompanyProfile | null>(null);
  const [companyProfileLoading, setCompanyProfileLoading] = useState(true);
  // Phase 8 #1: bump to refetch pay summaries after a shift edit
  // or delete lands. We hold this at the page level so the recompute
  // effect can re-run without losing the rows list.
  const [refreshTick, setRefreshTick] = useState(0);

  // Phase 19 #2: sort selector for the per-driver breakdown table.
  // Default is total-desc so the operator sees who they owe the most
  // first when running payouts. Name-asc kept as the alphabetical
  // fallback for ops who scan by driver.
  const [driverSort, setDriverSort] = useState<"total_desc" | "hours_desc" | "name_asc">(
    "total_desc",
  );

  // DRV-B: settlement state machine. listForPeriod returns the live
  // payout row per driver overlapping the window; the chip on each
  // row reads from this map. Map is keyed by driver_id.
  const [payoutsByDriver, setPayoutsByDriver] = useState<Map<string, DriverPayoutRow>>(
    new Map(),
  );
  const [settledFilter, setSettledFilter] = useState<"all" | "unsettled" | "settled">("all");
  // DRV-C (task #216, 2026-05-25): previous-period totals so the
  // chip row can show period-over-period deltas. Same shape as the
  // current totals just for the immediately prior window of the
  // same length (e.g. last_30 → the 30 days before that). Updates
  // alongside the main bulk-totals effect.
  const [prevTotals, setPrevTotals] = useState<{
    hours: number; hourlyPay: number; grand: number;
  } | null>(null);
  const [bulkPayBusy, setBulkPayBusy] = useState(false);

  const [payoutDialog, setPayoutDialog] = useState<null | {
    driverId: string;
    driverName: string;
    totals: {
      hours_total: number;
      hourly_pay: number;
      distance_total_km: number;
      distance_pay: number;
      callout_pay: number;
      grand_total: number;
      shifts_needing_review: number;
    };
    method: DriverPayoutMethod;
    reference: string;
    notes: string;
    busy: boolean;
  }>(null);

  // Company identity is always read from the signed-in tenant. The
  // same saved profile fields drive invoice headers and payslips.
  useEffect(() => {
    let cancelled = false;
    setCompanyProfile(null);
    setCompanyProfileLoading(true);
    if (!user?.company_id) {
      setCompanyProfileLoading(false);
      return () => { cancelled = true; };
    }
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("company_name, legal_name, email, phone, website, address_line1, address_line2, city, state_province, postal_code, country, registration_number, tax_number, vat_registered, vat_number, logo_url, primary_color, accent_color, slug")
        .eq("id", user.company_id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) throw new Error("Company profile could not be loaded for this payslip.");
      const company = data as any;
      const slug = String(company.slug || "").trim();
      const companyName = String(company.company_name || company.legal_name || "").trim();
      if (!companyName) throw new Error("Add a business name in company settings before generating payslips.");
      setCompanyProfile({
        companyName,
        companyLegalName: company.legal_name || null,
        companyAddress: [company.address_line1, company.address_line2, company.city, company.state_province, company.postal_code, company.country]
          .filter(Boolean)
          .join(", "),
        companyEmail: company.email || null,
        companyPhone: company.phone || null,
        companyWebsite: company.website || null,
        companyRegistrationNumber: company.registration_number || null,
        companyTaxNumber: company.tax_number || null,
        companyVatNumber: company.vat_number || null,
        companyVatRegistered: !!company.vat_registered,
        companyLogoUrl: slug ? `/api/pwa/icon?slug=${encodeURIComponent(slug)}&size=180` : null,
        companyBrandColor: company.primary_color || company.accent_color || null,
      });
    })().catch((error) => {
      captureException(error, {
        tags: { route: "/admin/driver-settlement", step: "load-payslip-company", companyId: user?.company_id },
      });
    }).finally(() => {
      if (!cancelled) setCompanyProfileLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.company_id]);

  useEffect(() => {
    if (preset === "last_7") { setFrom(daysAgoIso(7)); setTo(todayIso()); }
    else if (preset === "last_30") { setFrom(daysAgoIso(30)); setTo(todayIso()); }
    else if (preset === "month_to_date") { setFrom(startOfMonthIso()); setTo(todayIso()); }
    else if (preset === "last_month") { const r = lastMonthRange(); setFrom(r.from); setTo(r.to); }
  }, [preset]);

  // Command-centre audit: a custom range with From after To returns
  // all-zero totals from the pay service, which reads exactly like
  // "nobody worked". ISO date strings compare lexicographically, so
  // a plain string compare is safe here. Surfaced as an inline
  // warning on the toolbar rather than silently showing zeros.
  const rangeInvalid = !!from && !!to && from > to;

  // Load the driver list for the company on mount.
  //
  // Includes soft-deleted drivers (deleted_at IS NOT NULL) so the
  // operator can still pay out hours / deliveries that closed before
  // the driver was removed. We mark them with is_removed = true and
  // hide the row in the UI when their period totals are zero.
  useEffect(() => {
    if (!user?.company_id) { setLoadingDrivers(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingDrivers(true);
      setDriversError(null);
      try {
        let q = (supabase as any)
          .from("profiles")
          .select("id, full_name, email, phone, phone_number, mobile_number, is_active, deleted_at, region_id")
          .eq("company_id", user.company_id)
          .eq("role", "driver");
        // DRV-B region filter: when the global filter is set, match
        // the driver's region_id OR include driver rows with no
        // region tag (NULL = cross-region driver, visible everywhere).
        if (regionFilterId) {
          q = q.or(`region_id.eq.${regionFilterId},region_id.is.null`);
        }
        const { data, error } = await q;
        if (error) throw error;
        const drivers: DriverRow[] = (data || []).map((d: any) => ({
          id: d.id,
          full_name: d.full_name || d.email || "Unnamed",
          email: d.email || "",
          phone: d.phone || d.phone_number || d.mobile_number || "",
          is_active: !!d.is_active,
          is_removed: !!d.deleted_at,
        }));
        if (!cancelled) {
          setRows(drivers.map((d) => ({ driver: d, summary: null, loading: true })));
        }
      } catch (e: any) {
        captureException(e, {
          tags: { route: "/admin/driver-settlement", step: "load-drivers", companyId: user?.company_id },
        });
        if (!cancelled) setDriversError(e?.message || "Could not load drivers. Check your connection and try again.");
        toast({ title: "Could not load drivers", variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.company_id, regionFilterId, toast, loadTick]);

  // DRV-B: recompute pay summaries via the bulk helper. The N+1
  // pattern (1 getPaySummary call per driver, each fanning out 5
  // round trips) used to be 25 round trips for a 5-driver tenant
  // on every range change. getBulkPayTotals does 5 parallel
  // fetches total, regardless of driver count.
  //
  // Per-shift / per-delivery detail is loaded lazily when the row
  // is expanded - via the original getPaySummary path - so the
  // initial render stays cheap while drilldowns still get the full
  // breakdown.
  useEffect(() => {
    if (!user?.company_id || rows.length === 0) return;
    let cancelled = false;
    const driverIds = rows.map((r) => r.driver.id);
    (async () => {
      setRows((prev) => prev.map((r) => ({ ...r, loading: true })));
      try {
        const totalsByDriver = await driverPayService.getBulkPayTotals({
          companyId: user.company_id,
          driverIds,
          range: { from, to },
        });
        if (cancelled) return;
        // Synthesise a thin DriverPaySummary so the existing table
        // can render off the .totals path. Per-shift / per-delivery
        // arrays are filled in by the expand handler.
        setRows((prev) => prev.map((r) => {
          const t = totalsByDriver.get(r.driver.id);
          if (!t) return { ...r, summary: null, loading: false };
          const thin: DriverPaySummary = {
            rates: t.rates,
            shifts: [],
            deliveries: [],
            totals: {
              hours_total: t.hours_total,
              hourly_pay: t.hourly_pay,
              distance_total_km: t.distance_total_km,
              distance_unrecorded_deliveries: t.distance_unrecorded_deliveries,
              distance_pay: t.distance_pay,
              callout_pay: t.callout_pay,
              grand_total: t.grand_total,
              shifts_needing_review: t.shifts_needing_review || 0,
            },
          };
          return { ...r, summary: thin, loading: false };
        }));
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/driver-settlement", step: "bulk-pay-totals", companyId: user?.company_id },
        });
        if (!cancelled) {
          setRows((prev) => prev.map((r) => ({ ...r, summary: null, loading: false })));
          toast({
            title: "Could not load driver pay",
            description: "Totals failed to refresh. Try Refresh.",
            variant: "destructive",
          });
        }
      }
    })();
    return () => { cancelled = true; };
    // We deliberately depend on rows.length (not rows itself) so the
    // recompute fires when the list shape changes, not on every
    // setRows in the inner effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id, from, to, rows.length, refreshTick]);

  // DRV-C (task #216, 2026-05-25): previous-period totals fetch.
  // Same shape as the bulk current-period call, range shifted by
  // the period length so "Last 30 days" reads the 30 days before
  // that. Powers the period-over-period delta chip. Best-effort:
  // a failure here just hides the delta - the page still renders.
  useEffect(() => {
    if (!user?.company_id || rows.length === 0) { setPrevTotals(null); return; }
    let cancelled = false;
    const driverIds = rows.map((r) => r.driver.id);
    (async () => {
      try {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(to).getTime();
        const span = Math.max(86_400_000, toMs - fromMs);
        const prevTo = toLocalISO(new Date(fromMs - 86_400_000));
        const prevFrom = toLocalISO(new Date(fromMs - 86_400_000 - span));
        const totalsByDriver = await driverPayService.getBulkPayTotals({
          companyId: user.company_id,
          driverIds,
          range: { from: prevFrom, to: prevTo },
        });
        if (cancelled) return;
        let hours = 0, hourlyPay = 0, grand = 0;
        for (const t of totalsByDriver.values()) {
          hours += t.hours_total;
          hourlyPay += t.hourly_pay;
          grand += t.grand_total;
        }
        setPrevTotals({ hours, hourlyPay, grand });
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/driver-settlement", step: "prev-period-totals", companyId: user?.company_id },
        });
        if (!cancelled) setPrevTotals(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id, from, to, rows.length, refreshTick]);

  // DRV-B: payouts overlapping the window. Refreshed alongside pay
  // totals so the "Paid" chip on each row stays in sync after a
  // mark-as-paid action elsewhere in the tenant.
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    setPayoutsByDriver(new Map());
    (async () => {
      try {
        const map = await driverPayoutService.listForPeriod({
          companyId: user.company_id,
          periodFrom: from,
          periodTo: to,
        });
        if (!cancelled) setPayoutsByDriver(map);
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/driver-settlement", step: "load-payouts", companyId: user?.company_id },
        });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.company_id, from, to, refreshTick]);

  // DRV-B: realtime subscription. A live driver clock-out (auto or
  // manual) or a payout recorded elsewhere should refresh the page
  // without a manual Refresh tap. Debounced because clock events
  // often arrive in clusters at shift boundaries.
  useEffect(() => {
    if (!user?.company_id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshTick((n) => n + 1), 500);
    };
    const channel = supabase
      .channel(`driver-settlement:${user.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_shifts", filter: `company_id=eq.${user.company_id}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_payouts", filter: `company_id=eq.${user.company_id}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user?.company_id]);

  // DRV-B: deep-link support. /admin/driver-settlement?driver=<id>
  // (used by the wages drivers tab) auto-expands the matching row
  // and scrolls it into view once the driver list is loaded.
  useEffect(() => {
    const driverParam = router.query.driver;
    const driverId = Array.isArray(driverParam) ? driverParam[0] : driverParam;
    if (!driverId || rows.length === 0) return;
    if (!rows.some((r) => r.driver.id === driverId)) return;
    setExpanded((prev) => {
      if (prev.has(driverId)) return prev;
      const next = new Set(prev);
      next.add(driverId);
      return next;
    });
    // Scroll on next paint so the row actually exists.
    setTimeout(() => {
      const el = document.getElementById(`driver-row-${driverId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [router.query.driver, rows]);

  const totals = useMemo(() => {
    // DRV-B: drivers count == roster (number of fetched summaries),
    // active == drivers with grand_total > 0. Pre-DRV-B "Drivers
    // paid" tile read the roster which was misleading when only
    // one driver had hours.
    let hours = 0, hourlyPay = 0, distanceKm = 0, distancePay = 0, callout = 0, grand = 0, shiftsToReview = 0;
    let roster = 0, active = 0;
    for (const r of rows) {
      const s = r.summary?.totals;
      if (!s) continue;
      roster += 1;
      if (s.grand_total > 0) active += 1;
      hours += s.hours_total;
      hourlyPay += s.hourly_pay;
      distanceKm += s.distance_total_km;
      distancePay += s.distance_pay;
      callout += s.callout_pay;
      grand += s.grand_total;
      shiftsToReview += s.shifts_needing_review || 0;
    }
    return { hours, hourlyPay, distanceKm, distancePay, callout, grand, roster, active, shiftsToReview };
  }, [rows]);

  const exportCsv = () => {
    const header = [
      "Driver", "Email", "Hours", "Hourly pay", "Distance (km)", "Distance pay", "Callouts", "Callout pay", "Grand total",
      // DRV-B: settlement status + paid-at columns so finance can
      // reconcile against the rand totals already in the export.
      "Shifts needing review", "Settlement status", "Paid at", "Paid method", "Paid reference",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const s = r.summary?.totals;
      if (!s) continue;
      const payout = payoutsByDriver.get(r.driver.id);
      lines.push([
        `"${r.driver.full_name.replace(/"/g, '""')}"`,
        `"${r.driver.email.replace(/"/g, '""')}"`,
        s.hours_total.toFixed(2),
        s.hourly_pay.toFixed(2),
        s.distance_total_km.toFixed(2),
        s.distance_pay.toFixed(2),
        // Data-honesty fix: the bulk path drops the per-delivery array
        // (always []), so a hard 0 here contradicted a non-zero callout
        // pay column in the same row. Emit the real count only when the
        // drilldown loaded it; otherwise blank = unknown, and 0 only
        // when callout pay is genuinely zero.
        (r.summary?.deliveries.length || 0) > 0
          ? r.summary!.deliveries.length
          : (s.callout_pay === 0 ? 0 : ""),
        s.callout_pay.toFixed(2),
        s.grand_total.toFixed(2),
        s.shifts_needing_review || 0,
        payout?.status ?? "unsettled",
        payout?.paid_at ? `"${payout.paid_at}"` : "",
        payout?.paid_method ?? "",
        payout?.paid_reference ? `"${payout.paid_reference.replace(/"/g, '""')}"` : "",
      ].join(","));
    }
    // DRV-B: UTF-8 BOM so Excel-ZA renders ZAR + diacritics. Same
    // pattern every other admin CSV uses since CAL-B (task #116).
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `driver-settlement_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // DRV-B: open the mark-as-paid dialog with the current totals
  // pre-loaded. Saves a click - the operator usually just confirms.
  const openPayoutDialog = (driverId: string, driverName: string) => {
    const r = rows.find((x) => x.driver.id === driverId);
    const t = r?.summary?.totals;
    if (!t) {
      toast({ title: "No totals to settle yet", description: "Wait for the row to finish loading.", variant: "destructive" });
      return;
    }
    if ((t.shifts_needing_review || 0) > 0) {
      toast({
        title: "Review driver shifts first",
        description: `${driverName} has ${t.shifts_needing_review} shift${t.shifts_needing_review === 1 ? "" : "s"} with clock data that needs correction. Expand the driver row to edit them before settling.`,
        variant: "destructive",
      });
      return;
    }
    setPayoutDialog({
      driverId,
      driverName,
      totals: {
        hours_total: t.hours_total,
        hourly_pay: t.hourly_pay,
        distance_total_km: t.distance_total_km,
        distance_pay: t.distance_pay,
        callout_pay: t.callout_pay,
        grand_total: t.grand_total,
        shifts_needing_review: t.shifts_needing_review || 0,
      },
      method: "eft",
      reference: "",
      notes: "",
      busy: false,
    });
  };

  const confirmMarkPaid = async (goToNext = false) => {
    if (!payoutDialog || !user?.company_id) return;
    const currentPayout = payoutDialog;
    setPayoutDialog((d) => (d ? { ...d, busy: true } : d));
    try {
      const draft = await driverPayoutService.ensureDraft({
        companyId: user.company_id,
        driverId: payoutDialog.driverId,
        periodFrom: from,
        periodTo: to,
        totals: {
          hours_total: payoutDialog.totals.hours_total,
          hourly_pay: payoutDialog.totals.hourly_pay,
          distance_total_km: payoutDialog.totals.distance_total_km,
          distance_pay: payoutDialog.totals.distance_pay,
          callout_pay: payoutDialog.totals.callout_pay,
          gross_total: payoutDialog.totals.grand_total,
        },
        actorUserId: user?.id,
      });
      if (!draft.ok || !draft.payout) throw new Error(draft.error || "Could not create draft");
      const paid = await driverPayoutService.markPaid({
        payoutId: draft.payout.id,
        paidMethod: payoutDialog.method,
        paidReference: payoutDialog.reference.trim() || null,
        paidNotes: payoutDialog.notes.trim() || null,
        totals: {
          hours_total: payoutDialog.totals.hours_total,
          hourly_pay: payoutDialog.totals.hourly_pay,
          distance_total_km: payoutDialog.totals.distance_total_km,
          distance_pay: payoutDialog.totals.distance_pay,
          callout_pay: payoutDialog.totals.callout_pay,
          gross_total: payoutDialog.totals.grand_total,
        },
        actorUserId: user?.id,
      });
      if (!paid.ok || !paid.payout) throw new Error(paid.error || "Could not mark as paid");
      toast({
        title: goToNext ? "Payout recorded" : "Payout recorded",
        description: `${currentPayout.driverName}: ${formatR(currentPayout.totals.grand_total)} via ${currentPayout.method}.`,
      });
      // Optimistic - the realtime channel will also fire but the
      // local map gets the new row immediately.
      setPayoutsByDriver((prev) => {
        const next = new Map(prev);
        next.set(paid.payout!.driver_id, paid.payout!);
        return next;
      });
      if (goToNext) {
        const nextDriver = getNextEligibleDriver(currentPayout.driverId);
        if (nextDriver?.summary?.totals) {
          openPayoutDialog(nextDriver.driver.id, nextDriver.driver.full_name);
          toast({ title: "Next driver ready", description: nextDriver.driver.full_name });
        } else {
          setPayoutDialog(null);
          toast({ title: "All eligible drivers settled", description: "No other unpaid driver is ready for payout in this period." });
        }
      } else {
        setPayoutDialog(null);
      }
    } catch (e: any) {
      captureException(e, {
          tags: { route: "/admin/driver-settlement", step: "mark-paid", companyId: user?.company_id },
      });
      toast({ title: "Payout failed", description: e?.message || "Try again.", variant: "destructive" });
      setPayoutDialog((d) => (d ? { ...d, busy: false } : d));
    }
  };

  const reversePayout = async (payoutId: string, driverName: string) => {
    if (!user?.company_id) return;
    if (!window.confirm(`Reverse the payout for ${driverName}? The row stays in audit, but stops counting as settled.`)) return;
    try {
      const res = await driverPayoutService.reverse({
        payoutId,
        reason: "manager_reversal",
        actorUserId: user?.id,
      });
      if (!res.ok) throw new Error(res.error || "Could not reverse");
      toast({ title: "Payout reversed", description: `${driverName} is back to unsettled.` });
      setRefreshTick((n) => n + 1);
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/driver-settlement", step: "reverse-payout", companyId: user?.company_id },
      });
      toast({ title: "Reverse failed", description: e?.message || "Try again.", variant: "destructive" });
    }
  };

  // DRV-C (task #216, 2026-05-25): bulk-mark-all-paid. Walks every
  // unsettled row with a positive total, drafts the payout + flips
  // it to paid using the eft default method. Same audit trail as
  // the per-row dialog; the confirm hurdle is the window.confirm.
  // Optimistic local map updates after each success so the table
  // re-renders progressively.
  const bulkMarkAllPaid = async () => {
    if (!user?.company_id) return;
    const candidates = rows.filter((r) => {
      const t = r.summary?.totals;
      if (!t || t.grand_total <= 0 || (t.shifts_needing_review || 0) > 0) return false;
      return payoutsByDriver.get(r.driver.id)?.status !== "paid";
    });
    if (candidates.length === 0) {
      toast({ title: "Nothing eligible to settle", description: rows.some((r) => (r.summary?.totals.shifts_needing_review || 0) > 0)
        ? "Correct flagged shift clocks first. Other unpaid drivers may already be settled."
        : "Every driver with payable totals is already paid." });
      return;
    }
    const owedSum = candidates.reduce((s, r) => s + (r.summary?.totals.grand_total || 0), 0);
    if (!window.confirm(
      `Mark all ${candidates.length} unsettled driver${candidates.length === 1 ? "" : "s"} as paid via EFT? `
      + `Grand total ${formatR(owedSum)}. This writes one payout row per driver and is fully reversible.`,
    )) return;
    setBulkPayBusy(true);
    let success = 0, failed = 0;
    for (const r of candidates) {
      try {
        const t = r.summary!.totals;
        const draft = await driverPayoutService.ensureDraft({
          companyId: user.company_id,
          driverId: r.driver.id,
          periodFrom: from,
          periodTo: to,
          totals: {
            hours_total: t.hours_total,
            hourly_pay: t.hourly_pay,
            distance_total_km: t.distance_total_km,
            distance_pay: t.distance_pay,
            callout_pay: t.callout_pay,
            gross_total: t.grand_total,
          },
          actorUserId: user?.id,
        });
        if (!draft.ok || !draft.payout) throw new Error(draft.error || "draft failed");
        const paid = await driverPayoutService.markPaid({
          payoutId: draft.payout.id,
          paidMethod: "eft",
          paidReference: null,
          paidNotes: "Bulk Mark all paid",
          totals: {
            hours_total: t.hours_total,
            hourly_pay: t.hourly_pay,
            distance_total_km: t.distance_total_km,
            distance_pay: t.distance_pay,
            callout_pay: t.callout_pay,
            gross_total: t.grand_total,
          },
          actorUserId: user?.id,
        });
        if (!paid.ok || !paid.payout) throw new Error(paid.error || "mark-paid failed");
        setPayoutsByDriver((prev) => {
          const next = new Map(prev);
          next.set(paid.payout!.driver_id, paid.payout!);
          return next;
        });
        success += 1;
      } catch (e: any) {
        captureException(e, {
          tags: { route: "/admin/driver-settlement", step: "bulk-mark-paid", companyId: user?.company_id, driverId: r.driver.id },
        });
        failed += 1;
      }
    }
    setBulkPayBusy(false);
    toast({
      title: failed === 0 ? `Settled ${success} driver${success === 1 ? "" : "s"}` : `Settled ${success}, ${failed} failed`,
      description: failed === 0
        ? `Total ${formatR(owedSum)} marked as paid via EFT. Reverse any row from its chip.`
        : "Reverse and retry the failed rows individually.",
      variant: failed === 0 ? undefined : "destructive",
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getNextEligibleDriver = (currentDriverId: string) => {
    const ordered = [...rows].sort((a, b) => {
      const at = a.summary?.totals;
      const bt = b.summary?.totals;
      if (driverSort === "hours_desc") return Number(bt?.hours_total || 0) - Number(at?.hours_total || 0);
      if (driverSort === "name_asc") return a.driver.full_name.localeCompare(b.driver.full_name);
      return Number(bt?.grand_total || 0) - Number(at?.grand_total || 0);
    });
    const currentIndex = ordered.findIndex((row) => row.driver.id === currentDriverId);
    const candidates = currentIndex < 0
      ? ordered
      : [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex)];
    return candidates.find((row) => {
      const totals = row.summary?.totals;
      return !!totals
        && totals.grand_total > 0
        && !(totals.shifts_needing_review || 0)
        && payoutsByDriver.get(row.driver.id)?.status !== "paid";
    }) || null;
  };
  const nextEligibleDriver = payoutDialog ? getNextEligibleDriver(payoutDialog.driverId) : null;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Driver settlement - {companyProfile?.companyName || "CateringMS"}</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title={
              <span className="flex min-w-0 items-center gap-2">
                {companyProfile?.companyLogoUrl && (
                  <img src={companyProfile.companyLogoUrl} alt="" className="h-6 w-6 shrink-0 rounded-md border border-white/20 bg-white object-contain p-0.5" />
                )}
                <span>Driver settlement</span>
              </span>
            }
            subtitle="Driver shift hours and delivery pay for this period. Clock records needing correction are held before payout."
            meta={
              !loadingDrivers && !driversError && totals.roster > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {totals.active} of {totals.roster} driver{totals.roster === 1 ? "" : "s"} with pay
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {formatR(totals.grand)} this period
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                    {from} to {to}
                  </span>
                  {totals.shiftsToReview > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/40 bg-amber-300/15 px-2.5 py-1 text-[11px] font-semibold text-amber-50">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {totals.shiftsToReview} shift{totals.shiftsToReview === 1 ? "" : "s"} to review
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <div className="flex w-full min-w-0 items-center justify-end gap-2 xl:w-auto">
                {/* DRV-C: bulk Mark all paid. Walks every unsettled row
                    with a positive total, drafts + flips each to paid
                    via EFT in sequence. window.confirm is the hurdle. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="!h-8 !min-h-8 w-auto gap-1.5 px-2 text-xs sm:!h-9 sm:!min-h-9 sm:px-3 sm:text-sm"
                  aria-label="Settle eligible drivers"
                  onClick={bulkMarkAllPaid}
                  disabled={bulkPayBusy || rows.length === 0}
                  title="Draft + mark all unsettled drivers as paid via EFT. Reversible per row."
                >
                  {bulkPayBusy ? (
                    <Loader2 className="h-3.5 w-3.5 sm:mr-1.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5 sm:mr-1.5" />
                  )}
                  <span className="hidden sm:inline">Mark eligible paid</span>
                  <span className="sm:hidden">Settle</span>
                </Button>
                <Button variant="outline" size="sm" className="!h-8 !min-h-8 w-auto gap-1.5 px-2 text-xs sm:!h-9 sm:!min-h-9 sm:px-3 sm:text-sm" aria-label="Export settlement CSV" onClick={exportCsv} disabled={rows.length === 0} title="Export settlement CSV">
                  <Download className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Export CSV</span>
                </Button>
              </div>
            }
          />
          <PageWorkbench />

          {/* Surfaced driver-list failure with Retry; pre-audit a failed
              fetch rendered as "No drivers configured yet". */}
          {driversError && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-rose-900 mb-1">Couldn&apos;t load drivers</h2>
              <p className="text-sm text-slate-600 mb-3">{driversError}</p>
              <Button onClick={() => setLoadTick((n) => n + 1)} size="sm" disabled={loadingDrivers} className="bg-brand-primary hover:bg-brand-primary/90">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {/* Period picker */}
          <Card className="mb-6">
            <CardContent className="grid grid-cols-2 items-end gap-2 p-3 sm:flex sm:flex-wrap sm:gap-3 sm:p-4">
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <Label className="text-xs text-slate-500">Period</Label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as Preset)}
                  className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm bg-white sm:w-auto sm:px-3"
                >
                  <option value="last_7">Last 7 days</option>
                  <option value="last_30">Last 30 days</option>
                  <option value="month_to_date">This month</option>
                  <option value="last_month">Last month</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-slate-500">From</Label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="mt-1 w-full sm:w-44" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-slate-500">To</Label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="mt-1 w-full sm:w-44" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-slate-500">Sort by</Label>
                <select
                  value={driverSort}
                  onChange={(e) => setDriverSort(e.target.value as any)}
                  className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm bg-white sm:w-auto sm:px-3"
                >
                  <option value="total_desc">Total owed (high to low)</option>
                  <option value="hours_desc">Hours (high to low)</option>
                  <option value="name_asc">Name (A to Z)</option>
                </select>
              </div>
              {/* DRV-B: settlement filter. Defaults to all so the
                  table reads identically to pre-DRV-B. "Unsettled"
                  hides anyone already marked paid for this window;
                  "Settled" shows only paid drivers (useful for a
                  pay-day reconciliation against the bank export). */}
              <div className="min-w-0">
                <Label className="text-xs text-slate-500">Settlement</Label>
                <select
                  value={settledFilter}
                  onChange={(e) => setSettledFilter(e.target.value as "all" | "unsettled" | "settled")}
                  className="mt-1 w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm bg-white sm:w-auto sm:px-3"
                >
                  <option value="all">All drivers</option>
                  <option value="unsettled">Unsettled only</option>
                  <option value="settled">Settled only</option>
                </select>
              </div>
              {/* Command-centre restructure: Refresh / Mark all paid /
                  Export CSV moved to the hero actions band. This card
                  is now purely the period + sort + settlement toolbar. */}
              {rangeInvalid && (
                <div className="w-full flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                  The From date is after the To date, so no pay can be calculated. Fix the range to see totals.
                </div>
              )}
            </CardContent>
          </Card>

          <p className="-mt-3 mb-4 text-[11px] leading-4 text-slate-500 sm:text-xs">
            This view combines driver shift pay with delivery mileage and callouts. Staff Hours also includes order-linked work and payroll sessions, so its overall worked-hours totals cover a wider scope.
          </p>

          {totals.shiftsToReview > 0 && (
            <div className="mb-4 flex min-w-0 items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950 sm:text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="min-w-0">
                <strong>{totals.shiftsToReview} driver shift{totals.shiftsToReview === 1 ? " needs" : "s need"} review.</strong>{" "}
                Mismatched, missing, or over-24-hour clock records are excluded from pay and held until corrected. Open a flagged driver row to edit its times.
              </p>
            </div>
          )}

          {/* DRV-C (task #216, 2026-05-25): top intel chip row. Sits
              above the KPI tile strip so the manager can read the
              state of settlement at a glance:
                - Owed: sum of grand_total across unsettled rows,
                  red when > 0. Click to filter to unsettled.
                - Dormant: drivers with zero hours + zero deliveries
                  in this period. Surfaces forgotten staffers + the
                  4 / 5 emptiness on the Spit Braai screenshot was
                  exactly this signal.
                - Δ Hours / Δ Grand: period-over-period deltas
                  against the prior equal-length window. Green when
                  up vs prev, slate when first period (no baseline).
              */}
          {(() => {
      const unsettledRows = rows.filter((r) => {
              const t = r.summary?.totals;
        if (!t || t.grand_total <= 0 || (t.shifts_needing_review || 0) > 0) return false;
              return payoutsByDriver.get(r.driver.id)?.status !== "paid";
            });
      const owed = unsettledRows.reduce(
              (s, r) => s + (r.summary?.totals.grand_total || 0),
              0,
            );
            const dormant = rows.filter((r) => {
              if (r.loading || r.driver.is_removed || !r.driver.is_active) return false;
              const t = r.summary?.totals;
              return !t || (t.hours_total === 0 && t.distance_total_km === 0);
            }).length;
            const pct = (curr: number, prev: number | null | undefined) => {
              if (prev == null) return null;
              if (prev === 0) return curr > 0 ? 100 : null;
              return Math.round(((curr - prev) / prev) * 100);
            };
            const hoursDelta = pct(totals.hours, prevTotals?.hours);
            const grandDelta = pct(totals.grand, prevTotals?.grand);
            const renderDelta = (label: string, d: number | null) => {
              if (d == null) return null;
              const positive = d > 0;
              const neutral = d === 0;
              return (
                <Badge
                  variant="outline"
                  className={`px-3 py-1.5 text-sm tabular-nums ${
                    neutral
                      ? "border-slate-200 text-slate-600 bg-slate-50"
                      : positive
                        ? "border-brand-primary/30 text-brand-primary bg-brand-primary/10"
                        : "border-rose-300 text-rose-700 bg-rose-50"
                  }`}
                >
                  {neutral ? null : positive
                    ? <TrendingUp className="w-3 h-3 mr-1" />
                    : <TrendingDown className="w-3 h-3 mr-1" />}
                  {label} {d > 0 ? "+" : ""}{d}% vs prev
                </Badge>
              );
            };
            // Command-centre restructure: utilisation + settled progress
            // moved here from the old 7-tile strip so the StatTile row
            // below can stay a clean money breakdown that sums.
            const days = Math.max(
              1,
              Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1,
            );
            const capacity = totals.active * days * 8;
            const utilPct = capacity > 0 ? Math.round((totals.hours / capacity) * 100) : null;
      const settledCount = rows.filter((r) => {
              const t = r.summary?.totals;
        if (!t || t.grand_total <= 0 || (t.shifts_needing_review || 0) > 0) return false;
              return payoutsByDriver.get(r.driver.id)?.status === "paid";
            }).length;
            return (
              <div className="flex flex-wrap gap-2 mb-4">
                {owed > 0 && (
                  <button
                    type="button"
                    onClick={() => setSettledFilter("unsettled")}
                    className="inline-flex"
                    title="Show only unsettled drivers"
                  >
                    <Badge
                      variant="outline"
                      className="px-3 py-1.5 text-sm border-rose-300 text-rose-700 bg-rose-50 tabular-nums hover:bg-rose-100"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {formatR(owed)} owed across {unsettledRows.length} driver{unsettledRows.length === 1 ? "" : "s"}
                    </Badge>
                  </button>
                )}
                {owed === 0 && totals.active > 0 && totals.shiftsToReview === 0 && (
                  <Badge
                    variant="outline"
                    className="px-3 py-1.5 text-sm border-brand-primary/30 text-brand-primary bg-brand-primary/10"
                  >
                    <BadgeCheck className="w-3 h-3 mr-1" />
                    All settled for this period
                  </Badge>
                )}
                {totals.shiftsToReview > 0 && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                    <AlertTriangle className="mr-1 h-3 w-3" /> {totals.shiftsToReview} shift{totals.shiftsToReview === 1 ? "" : "s"} held for review
                  </Badge>
                )}
                {dormant > 0 && (
                  <Badge
                    variant="outline"
                    className="px-3 py-1.5 text-sm border-slate-200 text-slate-600 bg-slate-50"
                    title="Drivers on the roster with no shifts or deliveries in this window. Could be leave, manual logging or stale records."
                  >
                    <Moon className="w-3 h-3 mr-1" />
                    {dormant} dormant
                  </Badge>
                )}
                {utilPct != null && (
                  <Badge
                    variant="outline"
                    className="px-3 py-1.5 text-sm border-slate-200 text-slate-600 bg-slate-50 tabular-nums"
                    title="Hours worked as a share of active drivers x days x 8h."
                  >
                    Utilisation {utilPct}%
                  </Badge>
                )}
                {totals.active > 0 && (
                  <Badge
                    variant="outline"
                    className="px-3 py-1.5 text-sm border-slate-200 text-slate-600 bg-slate-50 tabular-nums"
                    title="Drivers already marked paid this period, out of every driver with pay."
                  >
                    Settled {settledCount} / {totals.active}
                  </Badge>
                )}
                {renderDelta("Hours", hoursDelta)}
                {renderDelta("Total", grandDelta)}
              </div>
            );
          })()}

          {/* Command-centre restructure: StatTile row. The three pay
              components are the visible breakdown of the grand total,
              so the strip always sums (hourly + distance + callout =
              grand). Utilisation + settled progress live in the intel
              chip row above; active/roster is a hero chip. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile
              compact
              label="Grand total"
              value={formatR(totals.grand)}
              hint="Hourly + distance + callout pay"
              icon={Wallet}
            />
            <StatTile
              compact
              label="Hourly pay"
              value={formatR(totals.hourlyPay)}
              hint={`${totals.hours.toFixed(1)}h worked this period`}
              icon={Clock}
            />
            <StatTile
              compact
              label="Distance pay"
              value={formatR(totals.distancePay)}
              hint={`${totals.distanceKm.toFixed(1)} km driven, round trip`}
              icon={Route}
            />
            <StatTile
              compact
              label="Callout pay"
              value={formatR(totals.callout)}
              hint="Flat fee per completed delivery"
              icon={MapPin}
            />
          </div>

          {loadingDrivers ? (
            <Card>
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading drivers...
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            driversError ? null : (
            <Card>
              <CardContent className="py-16 text-center text-slate-500">
                <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700 mb-1">No drivers configured yet</p>
                <p className="text-xs text-slate-500 mb-4">
                  Once drivers log shifts and complete deliveries, their pay lands here for settlement.
                </p>
                <Button asChild size="sm" className="bg-brand-primary hover:bg-brand-primary/90">
                  <Link href={withSlug("/admin/driver-management")}>Add a driver</Link>
                </Button>
              </CardContent>
            </Card>
            )
          ) : (() => {
            // DRV-B: shared filter + sort pipeline drives both the
            // desktop table and the mobile card stack so they
            // always agree on what's visible.
            const visibleRows = rows
              .filter((r) => {
                // Hide removed drivers when they have nothing to pay
                // out in the selected period (legacy behaviour kept).
                if (r.driver.is_removed) {
                  if (r.loading) return true;
                  const t = r.summary?.totals;
                  if (!t || t.grand_total <= 0) return false;
                }
                // DRV-B settlement filter.
                if (settledFilter === "all") return true;
                const payout = payoutsByDriver.get(r.driver.id);
                const isPaid = payout?.status === "paid";
                return settledFilter === "settled" ? isPaid : !isPaid;
              })
              .sort((a, b) => {
                const at = a.summary?.totals;
                const bt = b.summary?.totals;
                switch (driverSort) {
                  case "hours_desc":
                    return Number(bt?.hours_total || 0) - Number(at?.hours_total || 0);
                  case "name_asc":
                    return String((a.driver as any).full_name || "").localeCompare(
                      String((b.driver as any).full_name || ""),
                    );
                  case "total_desc":
                  default:
                    return Number(bt?.grand_total || 0) - Number(at?.grand_total || 0);
                }
              });
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Wallet className="h-4 w-4 text-brand-primary sm:h-5 sm:w-5" />
                    Per-driver breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* DRV-B: empty state when filters hide everything. */}
                  {visibleRows.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500">
                      {settledFilter === "settled"
                        ? "No drivers have been marked as settled in this period yet."
                        : settledFilter === "unsettled"
                        ? "Every driver with hours has been settled for this period. Nice."
                        : "No driver rows to show."}
                    </div>
                  ) : (
                    <>
                      {/* DRV-B desktop table (md+) */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/60">
                            <tr>
                              <th className="text-left px-4 py-2 font-semibold">Driver</th>
                              <th className="text-right px-4 py-2 font-semibold">Hours</th>
                              <th className="text-right px-4 py-2 font-semibold">Hourly pay</th>
                              <th
                                className="text-right px-4 py-2 font-semibold"
                                title="Round-trip kilometres (kitchen to venue and back). Matches the round-trip math used to bill the client for delivery."
                              >
                                Distance
                              </th>
                              <th className="text-right px-4 py-2 font-semibold">Distance pay</th>
                              <th className="text-right px-4 py-2 font-semibold">Callouts</th>
                              <th className="text-right px-4 py-2 font-semibold">Callout pay</th>
                              <th className="text-right px-4 py-2 font-semibold">Total</th>
                              <th className="text-center px-2 py-2 font-semibold">Status</th>
                              <th className="w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.map((r) => {
                              const t = r.summary?.totals;
                              const isOpen = expanded.has(r.driver.id);
                              return (
                                <FragmentRows
                                  key={r.driver.id}
                                  row={r}
                                  t={t}
                                  isOpen={isOpen}
                                  onToggle={() => toggleExpand(r.driver.id)}
                                  periodFrom={from}
                                  periodTo={to}
                                  companyId={user?.company_id || ""}
                                  companyProfile={companyProfile}
                                  companyProfileLoading={companyProfileLoading}
                                  currencyCode={tenantCurrency.code}
                                  formatR={formatR}
                                  toast={toast}
                                  actorUserId={user?.id}
                                  onShiftChanged={() => setRefreshTick((n) => n + 1)}
                                  payout={payoutsByDriver.get(r.driver.id) || null}
                                  onMarkPaid={() => openPayoutDialog(r.driver.id, r.driver.full_name)}
                                  onReverse={(payoutId) => reversePayout(payoutId, r.driver.full_name)}
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* DRV-B mobile card stack (<md). The 10-column
                          table is unusable on phones; the card view
                          surfaces only the rand totals + status +
                          actions, with everything else behind a
                          tap-to-expand row that opens the desktop
                          drilldown lazily. */}
                      <div className="md:hidden space-y-3">
                        {visibleRows.map((r) => (
                          <DriverSettlementCard
                            key={r.driver.id}
                            row={r}
                            payout={payoutsByDriver.get(r.driver.id) || null}
                            onMarkPaid={() => openPayoutDialog(r.driver.id, r.driver.full_name)}
                            onReverse={(payoutId) => reversePayout(payoutId, r.driver.full_name)}
                            formatR={formatR}
                            companyId={user?.company_id || ""}
                            periodFrom={from}
                            periodTo={to}
                            actorUserId={user?.id}
                            onShiftChanged={() => setRefreshTick((n) => n + 1)}
                            toast={toast}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* DRV-B: mark-as-paid dialog. Pulls the row's current
              totals at open time; the operator confirms the method
              (eft / cash / mobile_money / other) + an optional
              reference (e.g. EFT transaction id). markPaid writes
              the audit_logs row. */}
          <Dialog open={!!payoutDialog} onOpenChange={(o) => !o && setPayoutDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Record payout</DialogTitle>
                <DialogDescription>
                  Lock in the settlement for {payoutDialog?.driverName}. The totals snapshot here so a future rate change won't rewrite history.
                </DialogDescription>
              </DialogHeader>
              {payoutDialog && (
                <div className="space-y-3 py-1">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Hours</span>
                      <span className="tabular-nums">{payoutDialog.totals.hours_total.toFixed(2)}h</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Hourly pay</span>
                      <span className="tabular-nums">{formatR(payoutDialog.totals.hourly_pay)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Distance pay</span>
                      <span className="tabular-nums">{formatR(payoutDialog.totals.distance_pay)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Callout pay</span>
                      <span className="tabular-nums">{formatR(payoutDialog.totals.callout_pay)}</span>
                    </div>
                    <div className="flex justify-between text-brand-primary font-semibold pt-1 border-t border-slate-200 mt-2">
                      <span>Gross total</span>
                      <span className="tabular-nums">{formatR(payoutDialog.totals.grand_total)}</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="payout_method">Method</Label>
                    <select
                      id="payout_method"
                      value={payoutDialog.method}
                      onChange={(e) => setPayoutDialog({ ...payoutDialog, method: e.target.value as DriverPayoutMethod })}
                      className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="eft">EFT / bank transfer</option>
                      <option value="cash">Cash</option>
                      <option value="mobile_money">Mobile money</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="payout_ref">Reference (optional)</Label>
                    <Input
                      id="payout_ref"
                      value={payoutDialog.reference}
                      onChange={(e) => setPayoutDialog({ ...payoutDialog, reference: e.target.value })}
                      className="mt-1"
                      placeholder="EFT transaction id, receipt number, etc."
                    />
                  </div>
                  <div>
                    <Label htmlFor="payout_notes">Notes (optional)</Label>
                    <Input
                      id="payout_notes"
                      value={payoutDialog.notes}
                      onChange={(e) => setPayoutDialog({ ...payoutDialog, notes: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setPayoutDialog(null)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-md hover:bg-slate-50"
                  disabled={payoutDialog?.busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmMarkPaid(true)}
                  disabled={!payoutDialog || payoutDialog.busy || !nextEligibleDriver}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-brand-primary/30 bg-brand-primary/5 px-3 py-2 text-sm font-medium text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50"
                  title={nextEligibleDriver ? `Record this payout and continue to ${nextEligibleDriver.driver.full_name}` : "No other eligible driver is waiting for payout"}
                >
                  <CheckCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Mark paid &amp; next</span>
                  <span className="sm:hidden">Pay + next</span>
                </button>
                <button
                  type="button"
                  onClick={() => confirmMarkPaid(false)}
                  disabled={!payoutDialog || payoutDialog.busy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-primary px-3 py-2 text-sm text-white hover:bg-brand-primary/90 disabled:opacity-60"
                >
                  {payoutDialog?.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />}
                  Mark as paid
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}

function FragmentRows({
  row, t, isOpen, onToggle, periodFrom, periodTo, companyId, companyProfile, companyProfileLoading, currencyCode, formatR = formatRDefault, toast, actorUserId, onShiftChanged,
  payout, onMarkPaid, onReverse,
}: {
  row: SettlementRow;
  t: { hours_total: number; hourly_pay: number; distance_total_km: number; distance_pay: number; callout_pay: number; grand_total: number; shifts_needing_review?: number } | undefined;
  isOpen: boolean;
  onToggle: () => void;
  periodFrom: string;
  periodTo: string;
  companyId: string;
  companyProfile: DriverPayslipCompanyProfile | null;
  companyProfileLoading: boolean;
  /** TIGHTEN I.100: tenant currency code (companies.currency). Drives
   *  the symbol on the generated payslip PDF. */
  currencyCode?: string;
  /** TIGHTEN I.107: tenant-aware money formatter. Falls back to ZAR
   *  when the parent doesn't pass one (legacy callers). */
  formatR?: (n: number) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: any;
  actorUserId?: string | null;
  onShiftChanged?: () => void;
  payout: DriverPayoutRow | null;
  onMarkPaid: () => void;
  onReverse: (payoutId: string) => void;
}) {
  const { withSlug } = useTenantHref();
  // DRV-B: lazy-load the per-shift / per-delivery detail only when
  // the row is expanded. The bulk path that drives the totals
  // drops the per-row arrays to stay cheap; the drilldown drawer
  // fetches them on open so the page stays fast for tenants with
  // 20+ drivers.
  const [detail, setDetail] = useState<DriverPaySummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => { setDetail(null); }, [periodFrom, periodTo]);
  // TIGHTEN I.101 (2026-06-02): per-action busy guards. PDF + Email
  // buttons previously only gated on !hasPay, so a double-tap could
  // fire two PDF renders or two outbound emails to the driver. Now
  // disabled while in-flight.
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  useEffect(() => {
    if (!isOpen || detail) return;
    if (!row.driver.id || !companyId) return;
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const summary = await driverPayService.getPaySummary({
          companyId,
          driverId: row.driver.id,
          range: { from: periodFrom, to: periodTo },
        });
        if (!cancelled) setDetail(summary);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Keep expanded details tied to the selected date window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, row.driver.id, companyId, periodFrom, periodTo, detail]);

  const detailSummary = detail || row.summary;
  // Phase 8 #1: per-shift edit / delete state. Lives at the row
  // level so multiple rows can each have their own dialog open
  // without cross-talk.
  const [editingShift, setEditingShift] = useState<{
    shift_id: string;
    actual_start: string;
    actual_end: string;
    notes: string;
    rate_multiplier: number;
  } | null>(null);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);

  const toLocalForInput = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const clockLabel = (iso: string | null | undefined) => iso
    ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
    : "missing";
  const openEditShift = (s: any) => {
    setEditingShift({
      shift_id: s.shift_id,
      actual_start: toLocalForInput(s.actual_start),
      actual_end: toLocalForInput(s.actual_end),
      notes: s.notes || "",
      rate_multiplier: s.multiplier ?? 1,
    });
  };
  const saveShiftEdit = async () => {
    if (!editingShift) return;
    const startMs = new Date(editingShift.actual_start).getTime();
    const endMs = new Date(editingShift.actual_end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > 24 * 60 * 60 * 1000) {
      toast({
        title: "Check the clock times",
        description: "Enter a valid clock-in and clock-out. A payable shift must be longer than zero and no more than 24 hours.",
        variant: "destructive",
      });
      return;
    }
    setShiftBusy(true);
    try {
      const startIso = new Date(editingShift.actual_start).toISOString();
      const endIso = new Date(editingShift.actual_end).toISOString();
      const res = await driverPayService.updateShift(
        editingShift.shift_id,
        {
          actual_start: startIso as any,
          actual_end: endIso as any,
          notes: editingShift.notes.trim() || null,
          rate_multiplier: editingShift.rate_multiplier === 1 ? null : editingShift.rate_multiplier,
          status: "completed",
        },
        undefined,
        actorUserId ?? null,
      );
      if (!res.ok) throw new Error(res.error || "Update failed");
      toast({ title: "Shift updated", description: "Settlement totals will refresh." });
      setEditingShift(null);
      setDetail(null);
      onShiftChanged?.();
    } catch (e: any) {
      toast({ title: "Edit failed", description: e?.message, variant: "destructive" });
    } finally {
      setShiftBusy(false);
    }
  };
  const confirmDeleteShift = async () => {
    if (!deletingShiftId) return;
    setShiftBusy(true);
    try {
      const res = await driverPayService.deleteShift(deletingShiftId, undefined, actorUserId ?? null);
      if (!res.ok) throw new Error(res.error || "Delete failed");
      toast({ title: "Shift removed", description: "Settlement totals will refresh." });
      setDeletingShiftId(null);
      setDetail(null);
      onShiftChanged?.();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    } finally {
      setShiftBusy(false);
    }
  };
  // Payslips always load the full shift and delivery lines on demand;
  // the compact table summary intentionally omits those arrays.
  const getPayslipSummary = async () => {
    if (detail) return detail;
    const fullSummary = await driverPayService.getPaySummary({
      companyId,
      driverId: row.driver.id,
      range: { from: periodFrom, to: periodTo },
    });
    setDetail(fullSummary);
    return fullSummary;
  };

  // Phase 4 #7: payslip download. The full period breakdown is loaded
  // even when the operator has not expanded the driver row first.
  const handleDownload = async () => {
    if (!companyProfile) throw new Error("Company details are unavailable. Refresh and try again.");
    const summaryForPdf = await getPayslipSummary();
    if (!summaryForPdf) return;
    const { driverPayslipService } = await import("@/services/driverPayslipService");
    const exactPayout = payout?.period_from === periodFrom && payout.period_to === periodTo ? payout : null;
    const blob = await driverPayslipService.generatePayslipPdf({
      ...companyProfile,
      driverName: row.driver.full_name,
      driverEmail: row.driver.email || null,
      driverPhone: row.driver.phone || null,
      periodFrom,
      periodTo,
      currencyCode,
      payoutStatus: exactPayout?.status || null,
      payoutMethod: exactPayout?.paid_method || null,
      payoutReference: exactPayout?.paid_reference || null,
      paidAt: exactPayout?.paid_at || null,
    }, summaryForPdf);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = row.driver.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `payslip_${safeName}_${periodFrom}_to_${periodTo}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Phase 5 #4: email the same PDF to the driver. Same render, but
  // base64-encoded as an attachment on the per-tenant emailService
  // send so it picks up the company's branded sender + audit logging.
  const handleEmail = async () => {
    if (!companyProfile) throw new Error("Company details are unavailable. Refresh and try again.");
    const summaryForPdf = await getPayslipSummary();
    if (!summaryForPdf || !row.driver.email) return;
    const { driverPayslipService } = await import("@/services/driverPayslipService");
    const exactPayout = payout?.period_from === periodFrom && payout.period_to === periodTo ? payout : null;
    const blob = await driverPayslipService.generatePayslipPdf({
      ...companyProfile,
      driverName: row.driver.full_name,
      driverEmail: row.driver.email,
      driverPhone: row.driver.phone || null,
      periodFrom,
      periodTo,
      currencyCode,
      payoutStatus: exactPayout?.status || null,
      payoutMethod: exactPayout?.paid_method || null,
      payoutReference: exactPayout?.paid_reference || null,
      paidAt: exactPayout?.paid_at || null,
    }, summaryForPdf);
    // Resend / nodemailer attachment shape: filename + content (base64).
    const buf = await blob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buf).reduce((acc, b) => acc + String.fromCharCode(b), ""),
    );
    const safeName = row.driver.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const filename = `payslip_${safeName}_${periodFrom}_to_${periodTo}.pdf`;
    const res = await fetch("/api/admin/email-driver-payslip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driver_id: row.driver.id,
        driver_email: row.driver.email,
        driver_name: row.driver.full_name,
        period_from: periodFrom,
        period_to: periodTo,
        grand_total: summaryForPdf.totals.grand_total,
        attachment_filename: filename,
        attachment_base64: base64,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error || "Could not email payslip");
    }
  };
  const hasPay = !!(row.summary && t && t.grand_total > 0);
  const shiftReviewCount = t?.shifts_needing_review || 0;
  // DRV-B: per-driver settlement chip. payout state comes from the
  // parent map (already loaded once per period change). Reverse
  // action only on the paid state.
  const isPaid = payout?.status === "paid";
  const paidTotalsChanged = !!(isPaid && t && payout && (
    Math.abs(Number(payout.gross_total || 0) - t.grand_total) > 0.01
    || Math.abs(Number(payout.hours_total || 0) - t.hours_total) > 0.01
    || Math.abs(Number(payout.hourly_pay || 0) - t.hourly_pay) > 0.01
    || Math.abs(Number(payout.distance_total_km || 0) - t.distance_total_km) > 0.01
    || Math.abs(Number(payout.distance_pay || 0) - t.distance_pay) > 0.01
    || Math.abs(Number(payout.callout_pay || 0) - t.callout_pay) > 0.01
  ));
  return (
    <>
      <tr id={`driver-row-${row.driver.id}`} className="border-t border-slate-100 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={onToggle} className="text-slate-400 hover:text-slate-700">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <div>
              <p className="font-medium text-slate-900">{row.driver.full_name}</p>
              <p className="text-xs text-slate-500">{row.driver.email}</p>
            </div>
            {row.driver.is_removed ? (
              <Badge variant="outline" className="ml-2 text-xs bg-rose-50 text-rose-700 border-rose-200">
                Removed
              </Badge>
            ) : !row.driver.is_active ? (
              <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>
            ) : null}
          </div>
        </td>
        {row.loading ? (
          <td colSpan={7} className="px-4 py-3 text-slate-400 italic">
            <RefreshCw className="w-3 h-3 inline-block mr-1 animate-spin" /> calculating...
          </td>
        ) : !t ? (
          <td colSpan={7} className="px-4 py-3 text-rose-500 italic">Failed to load</td>
        ) : (
          <>
            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{t.hours_total.toFixed(2)}h</td>
            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatR(t.hourly_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{t.distance_total_km.toFixed(1)} km</td>
            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatR(t.distance_pay)}</td>
            {/* Data-honesty fix: the bulk totals path drops the per-
                delivery array (deliveries always []), so this cell used
                to read 0 next to a non-zero Callout pay - a visible
                contradiction. Until the drilldown loads the real list,
                show a dash when callout pay exists but the count is
                unknown. */}
            <td
              className="px-4 py-3 text-right tabular-nums"
              title={!detail && t.callout_pay > 0 ? "Expand the row to load the delivery list" : undefined}
            >
              {detail
                ? detail.deliveries.length
                : t.callout_pay === 0
                  ? 0
                  : "-"}
            </td>
            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatR(t.callout_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-brand-primary">{formatR(t.grand_total)}</td>
          </>
        )}
        {/* DRV-B settlement status column. Paid = green chip with
            paid_at; Reviewed = amber; otherwise an action button to
            open the mark-as-paid dialog. Empty when there's nothing
            to settle (zero total). */}
        <td className="px-2 py-3 text-center">
          {shiftReviewCount > 0 ? (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
              title="Expand and correct clock records before paying this driver"
            >
              <AlertTriangle className="h-3 w-3" /> Review {shiftReviewCount}
            </button>
          ) : !hasPay ? (
            <span className="text-[10px] text-slate-300">-</span>
          ) : isPaid ? (
            <button
              type="button"
              onClick={() => onReverse(payout!.id)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${paidTotalsChanged ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-brand-primary/20 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15"}`}
              title={`${paidTotalsChanged ? "Current totals differ from the recorded payout. " : ""}Paid via ${payout!.paid_method || "-"}${payout!.paid_reference ? ` (${payout!.paid_reference})` : ""}. Click to reverse and reconcile.`}
            >
              {paidTotalsChanged ? <AlertTriangle className="h-3 w-3" /> : <BadgeCheck className="w-3 h-3" />}
              {paidTotalsChanged ? "Paid · changed" : "Paid"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onMarkPaid}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200 hover:bg-brand-primary/10 hover:text-brand-primary hover:border-brand-primary/20"
              title="Record this payout"
            >
              <CircleDashed className="w-3 h-3" /> Mark paid
            </button>
          )}
        </td>
        <td className="pr-2">
          {/* DRV-B: PDF + Email actions. Disabled (not hidden) when
              there's nothing to pay this period - operators saw the
              missing buttons as a bug pre-DRV-B. */}
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={async () => {
                if (pdfBusy) return;
                setPdfBusy(true);
                try {
                  await handleDownload();
                } catch (e: any) {
                  toast({
                    title: "Could not create payslip",
                    description: e?.message || "Try again.",
                    variant: "destructive",
                  });
                } finally {
                  setPdfBusy(false);
                }
              }}
              disabled={!hasPay || pdfBusy || companyProfileLoading || !companyProfile}
              title={companyProfileLoading ? "Loading company details" : !companyProfile ? "Company details unavailable" : hasPay ? "Download payslip PDF" : "No pay this period"}
            >
              <Download className="w-3 h-3" /> {pdfBusy ? "..." : "PDF"}
            </Button>
            {row.driver.email && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={!hasPay || emailBusy || companyProfileLoading || !companyProfile}
                onClick={async () => {
                  if (emailBusy) return;
                  setEmailBusy(true);
                  try {
                    await handleEmail();
                    toast({
                      title: "Payslip emailed",
                      description: `Sent to ${row.driver.email}`,
                    });
                  } catch (e: any) {
                    toast({
                      title: "Could not email payslip",
                      description: e?.message || "Try again",
                      variant: "destructive",
                    });
                  } finally {
                    setEmailBusy(false);
                  }
                }}
                title={companyProfileLoading ? "Loading company details" : !companyProfile ? "Company details unavailable" : hasPay ? "Email this payslip to the driver" : "No pay this period"}
              >
                {emailBusy ? "Sending..." : "Email"}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/50">
          <td colSpan={10} className="px-4 py-3">
            {detailLoading && !detail ? (
              <div className="text-sm text-slate-500 flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading shifts and deliveries...
              </div>
            ) : !detailSummary ? (
              <div className="text-sm text-rose-500 py-4">Failed to load detail. Try Refresh.</div>
            ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Shifts ({detailSummary.shifts.length})
                </p>
                {detailSummary.shifts.length === 0 ? (
                  <p className="text-sm text-slate-500">No shifts in this period.</p>
                ) : (
                  <ul className="text-xs space-y-2">
                    {detailSummary.shifts.map((s) => {
                      const buckets = (s as any).bcea_buckets as
                        | Array<{
                            date: string;
                            hours: number;
                            dayMultiplier: number;
                            overtimeHours: number;
                            pay: number;
                          }>
                        | undefined;
                      const hasBreakdown = buckets && buckets.length > 1;
                      const hasMultiplier = s.multiplier !== 1;
                      const hasOvertime = !!buckets?.some((b) => b.overtimeHours > 0);
                      return (
                        <li key={s.shift_id} className={`border-l-2 pl-2 ${s.needs_review ? "border-amber-400 bg-amber-50/70 py-1.5 pr-1" : "border-slate-200"}`}>
                          <div className="flex justify-between items-start gap-2">
                            <span className="flex-1">
                              {s.hours.toFixed(2)}h @ {formatR(s.hourly_rate)}/hr{" "}
                              <span className="block text-[10px] font-normal text-slate-500">{s.shift_date || "Date unknown"} · {clockLabel(s.actual_start)}–{clockLabel(s.actual_end)}</span>
                              {s.needs_review && (
                                <span className="block font-semibold text-amber-800">Held: {s.review_reason || "Clock record needs review"}</span>
                              )}
                              {hasMultiplier && (
                                <span className="text-amber-700 font-medium">× {s.multiplier}</span>
                              )}
                              {hasOvertime && (
                                <span className="text-amber-700 font-medium"> (includes overtime)</span>
                              )}
                            </span>
                            <span className={`font-medium tabular-nums ${s.needs_review ? "text-amber-800" : ""}`}>{formatR(s.pay)}</span>
                            {/* Phase 8 #1: admin edit / soft-delete
                                actions per shift. Visible on hover
                                so they don't crowd the row. Audit log
                                handled inside driverPayService. */}
                            <div className="flex shrink-0 gap-0.5 -my-0.5">
                              <button
                                type="button"
                                onClick={() => openEditShift(s)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="Edit shift"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingShiftId(s.shift_id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                title="Delete shift"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {/* Phase 3 #2: per-day BCEA buckets, shown
                              when a shift crosses midnight (multiple
                              buckets) or includes Sunday/PH/overtime
                              uplifts. Otherwise the single-day case
                              is the same as the headline above. */}
                          {hasBreakdown && (
                            <ul className="mt-1 ml-2 text-[11px] text-slate-500 space-y-0.5">
                              {buckets!.map((b) => {
                                const day = new Date(b.date + "T12:00:00");
                                const dayLabel = day.toLocaleDateString("en-ZA", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                });
                                const tags: string[] = [];
                                if (b.dayMultiplier === 2) tags.push("Sun/PH ×2");
                                if (b.overtimeHours > 0) tags.push(`${b.overtimeHours.toFixed(2)}h OT ×1.5`);
                                return (
                                  <li key={b.date} className="flex justify-between">
                                    <span>
                                      {dayLabel}: {b.hours.toFixed(2)}h
                                      {tags.length > 0 && (
                                        <span className="text-amber-700"> ({tags.join(" + ")})</span>
                                      )}
                                    </span>
                                    <span className="tabular-nums">{formatR(b.pay)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Deliveries ({detailSummary.deliveries.length})
                </p>
                {detailSummary.deliveries.length === 0 ? (
                  <p className="text-sm text-slate-500">No deliveries in this period.</p>
                ) : (
                  <ul className="text-xs space-y-1">
                    {detailSummary.deliveries.map((d) => (
                      <li key={d.line_id || d.order_id} className="flex justify-between gap-3">
                        {/* ODOC G.4: each delivery jumps into the
                            doc for reconciliation context. */}
                        <Link
                          href={withSlug(staffOrderHref(d.order_id, "admin"))}
                          className="font-mono text-blue-700 hover:underline"
                        >
                          {d.order_id.slice(0, 8)}...{d.sitting_sequence ? ` · Sitting ${d.sitting_sequence}` : ""}
                        </Link>
                        <span className="text-right">
                          {d.distance_km.toFixed(1)} km · {formatR(d.total)}
                          {d.gps_trip_duration_minutes != null && <span className="block text-[10px] text-slate-500">Timer {Math.floor(d.gps_trip_duration_minutes / 60)}h {d.gps_trip_duration_minutes % 60}m</span>}
                          {d.distance_source === "gps_actual" && <span className="block text-[10px] text-emerald-700">GPS actual distance</span>}
                          {d.distance_source === "booking_route_split" && <span className="block text-[10px] text-amber-700" title="The saved booking route total is allocated across sitting stops using their locations.">Allocated route share</span>}
                          {d.gps_distance_status === "partial" && <span className="block text-[10px] text-amber-700" title="GPS samples were incomplete, so settlement uses the saved route estimate.">GPS partial · {d.gps_distance_km == null ? "no reliable points" : `${d.gps_distance_km.toFixed(1)} km captured`} · estimate used</span>}
                          {d.gps_distance_review_required && <span className="block text-[10px] font-semibold text-red-700" title={d.gps_distance_review_reason || "GPS mileage materially exceeds the saved estimate."}>Review GPS route · {d.gps_expected_distance_km?.toFixed(1)} km estimated</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            )}
          </td>
        </tr>
      )}

      {/* Phase 8 #1: shift edit dialog. Mirrors LogDriverShiftModal
          inputs but minus the create-new flow. Saved patch routes
          through driverPayService.updateShift which writes an
          audit_logs row with before + patch. */}
      <Dialog open={!!editingShift} onOpenChange={(o) => !o && setEditingShift(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit shift</DialogTitle>
            <DialogDescription>
              Adjust the clock times, notes or pay multiplier. Audit logged.
            </DialogDescription>
          </DialogHeader>
          {editingShift && (
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit_shift_start">Clock in</Label>
                  <Input
                    id="edit_shift_start"
                    type="datetime-local"
                    value={editingShift.actual_start}
                    onChange={(e) => setEditingShift({ ...editingShift, actual_start: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_shift_end">Clock out</Label>
                  <Input
                    id="edit_shift_end"
                    type="datetime-local"
                    value={editingShift.actual_end}
                    onChange={(e) => setEditingShift({ ...editingShift, actual_end: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit_shift_mult">Pay multiplier</Label>
                <select
                  id="edit_shift_mult"
                  value={String(editingShift.rate_multiplier)}
                  onChange={(e) => setEditingShift({ ...editingShift, rate_multiplier: Number(e.target.value) })}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                >
                  <option value="1">1x - standard hours</option>
                  <option value="1.5">1.5x - overtime</option>
                  <option value="2">2x - Sunday / public holiday (BCEA)</option>
                </select>
              </div>
              <div>
                <Label htmlFor="edit_shift_notes">Notes</Label>
                <Input
                  id="edit_shift_notes"
                  value={editingShift.notes}
                  onChange={(e) => setEditingShift({ ...editingShift, notes: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditingShift(null)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-md hover:bg-slate-50"
              disabled={shiftBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveShiftEdit}
              disabled={shiftBusy}
              className="px-3 py-2 text-sm bg-brand-primary hover:opacity-90 text-white rounded-md flex items-center gap-1.5 disabled:opacity-60"
            >
              {shiftBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 8 #1: shift delete confirm. Soft delete via the
          deleted_at column so historical settlement reports stay
          truthful; audit row captures the before-snapshot so the
          shift can be reconstructed if needed. */}
      <Dialog open={!!deletingShiftId} onOpenChange={(o) => !o && setDeletingShiftId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this shift?</DialogTitle>
            <DialogDescription>
              The shift will disappear from settlement and stop counting toward
              pay. It is soft-deleted, so it can be recovered from audit logs
              if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeletingShiftId(null)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-md hover:bg-slate-50"
              disabled={shiftBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteShift}
              disabled={shiftBusy}
              className="px-3 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-md flex items-center gap-1.5 disabled:opacity-60"
            >
              {shiftBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * DRV-B: per-driver mobile card. The desktop table is unusable on
 * phones (10 columns); this card carries the same headline numbers
 * + status + actions in a stacked layout. Shift details stay
 * collapsed until needed, with clock editing available on phones.
 */
function DriverSettlementCard({
  row, payout, onMarkPaid, onReverse, formatR = formatRDefault,
  companyId, periodFrom, periodTo, actorUserId, onShiftChanged, toast,
}: {
  row: SettlementRow;
  payout: DriverPayoutRow | null;
  onMarkPaid: () => void;
  onReverse: (payoutId: string) => void;
  companyId: string;
  periodFrom: string;
  periodTo: string;
  actorUserId?: string | null;
  onShiftChanged: () => void;
  toast: (options: any) => void;
  /** TIGHTEN I.107: tenant-aware money formatter passed from parent. */
  formatR?: (n: number) => string;
}) {
  const t = row.summary?.totals;
  const hasPay = !!(t && t.grand_total > 0);
  const reviewCount = t?.shifts_needing_review || 0;
  const isPaid = payout?.status === "paid";
  const paidTotalsChanged = !!(isPaid && t && payout && (
    Math.abs(Number(payout.gross_total || 0) - t.grand_total) > 0.01
    || Math.abs(Number(payout.hours_total || 0) - t.hours_total) > 0.01
    || Math.abs(Number(payout.hourly_pay || 0) - t.hourly_pay) > 0.01
    || Math.abs(Number(payout.distance_total_km || 0) - t.distance_total_km) > 0.01
    || Math.abs(Number(payout.distance_pay || 0) - t.distance_pay) > 0.01
    || Math.abs(Number(payout.callout_pay || 0) - t.callout_pay) > 0.01
  ));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detail, setDetail] = useState<DriverPaySummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingShift, setEditingShift] = useState<{
    shift_id: string; actual_start: string; actual_end: string; notes: string; rate_multiplier: number;
  } | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);

  useEffect(() => {
    if (!detailsOpen || detail || !companyId) return;
    let cancelled = false;
    setDetailLoading(true);
    driverPayService.getPaySummary({ companyId, driverId: row.driver.id, range: { from: periodFrom, to: periodTo } })
      .then((summary) => { if (!cancelled) setDetail(summary); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [detailsOpen, detail, companyId, row.driver.id, periodFrom, periodTo]);

  const asLocalInput = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const clockLabel = (value?: string | null) => value
    ? new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
    : "missing";
  const saveEditedShift = async () => {
    if (!editingShift) return;
    const start = new Date(editingShift.actual_start).getTime();
    const end = new Date(editingShift.actual_end).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 60 * 60 * 1000) {
      toast({ title: "Check the clock times", description: "A shift must be longer than zero and no more than 24 hours.", variant: "destructive" });
      return;
    }
    setShiftBusy(true);
    const result = await driverPayService.updateShift(editingShift.shift_id, {
      actual_start: new Date(start).toISOString(),
      actual_end: new Date(end).toISOString(),
      notes: editingShift.notes.trim() || null,
      rate_multiplier: editingShift.rate_multiplier === 1 ? null : editingShift.rate_multiplier,
      status: "completed",
    }, undefined, actorUserId ?? null);
    setShiftBusy(false);
    if (!result.ok) {
      toast({ title: "Could not update shift", description: result.error || "Try again.", variant: "destructive" });
      return;
    }
    setEditingShift(null);
    setDetail(null);
    onShiftChanged();
    toast({ title: "Shift updated", description: "Settlement totals are refreshing." });
  };
  return (
    <div
      id={`driver-row-card-${row.driver.id}`}
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 truncate">{row.driver.full_name}</p>
            {row.driver.is_removed ? (
              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                Removed
              </Badge>
            ) : !row.driver.is_active ? (
              <Badge variant="outline" className="text-[10px]">Inactive</Badge>
            ) : null}
          </div>
          {row.driver.email && (
            <p className="text-[11px] text-slate-500 truncate">{row.driver.email}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {row.loading ? (
            <span className="text-[11px] text-slate-400 italic">
              <RefreshCw className="w-3 h-3 inline-block mr-1 animate-spin" /> ...
            </span>
          ) : !t ? (
            <span className="text-[11px] text-rose-500 italic">Failed</span>
          ) : (
            <>
              <p className="text-base font-bold text-brand-primary tabular-nums sm:text-lg">{formatR(t.grand_total)}</p>
              <p className="text-[10px] text-slate-500 tabular-nums sm:text-[11px]">{t.hours_total.toFixed(2)}h payable</p>
            </>
          )}
        </div>
      </div>
      {t && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
          <div>
            <div className="text-slate-400 uppercase tracking-wide text-[9px]">Hourly</div>
            <div className="tabular-nums">{formatR(t.hourly_pay)}</div>
          </div>
          <div>
            <div className="text-slate-400 uppercase tracking-wide text-[9px]">Distance</div>
            <div className="tabular-nums">{formatR(t.distance_pay)}</div>
            <div className="text-xs text-slate-400 tabular-nums">
              {t.distance_total_km.toFixed(1)} km round trip
            </div>
            {(t.distance_unrecorded_deliveries || 0) > 0 && (
              <div className="text-xs font-medium text-rose-600">
                {t.distance_unrecorded_deliveries} {t.distance_unrecorded_deliveries === 1 ? "delivery" : "deliveries"} missing distance
              </div>
            )}
          </div>
          <div>
            <div className="text-slate-400 uppercase tracking-wide text-[9px]">Callouts</div>
            <div className="tabular-nums">{formatR(t.callout_pay)}</div>
          </div>
        </div>
      )}
      {reviewCount > 0 && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{reviewCount} shift{reviewCount === 1 ? "" : "s"} held from pay. Correct the clock times below before settling.</span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        {reviewCount > 0 ? (
          <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
            {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {detailsOpen ? "Hide shift details" : "Review & edit shifts"}
          </button>
        ) : !hasPay ? (
          <span className="text-[11px] text-slate-400">Nothing to settle</span>
        ) : isPaid ? (
          <button
            type="button"
            onClick={() => onReverse(payout!.id)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${paidTotalsChanged ? "border-amber-300 bg-amber-50 text-amber-800" : "border-brand-primary/20 bg-brand-primary/10 text-brand-primary"}`}
            title={paidTotalsChanged ? "Current totals differ from the recorded payout. Tap to reverse and reconcile." : "Tap to reverse the recorded payout."}
          >
            {paidTotalsChanged ? <AlertTriangle className="h-3 w-3" /> : <BadgeCheck className="w-3 h-3" />}
            {paidTotalsChanged ? "Paid · changed" : "Paid · reverse"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkPaid}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium bg-brand-primary text-white hover:bg-brand-primary/90"
          >
            <CircleDashed className="w-3 h-3" /> Mark as paid
          </button>
        )}
        {reviewCount === 0 && (
          <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
            {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {detailsOpen ? "Hide details" : "Shift details"}
          </button>
        )}
      </div>
      {detailsOpen && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {detailLoading && !detail ? (
            <p className="flex items-center gap-1.5 py-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading shift details…</p>
          ) : !detail ? (
            <p className="py-2 text-xs text-rose-700">Could not load shift details. Close and reopen to retry.</p>
          ) : detail.shifts.length === 0 ? (
            <p className="py-2 text-xs text-slate-500">No shifts in this period.</p>
          ) : (
            <ul className="space-y-2">
              {detail.shifts.map((shift) => (
                <li key={shift.shift_id} className={`flex min-w-0 items-start justify-between gap-2 rounded-md border p-2 text-xs ${shift.needs_review ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50/60"}`}>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{shift.shift_date || "Shift"} · {shift.hours.toFixed(2)}h</p>
                    <p className="text-[11px] text-slate-500">{clockLabel(shift.actual_start)} – {clockLabel(shift.actual_end)}</p>
                    {shift.needs_review ? <p className="mt-0.5 text-[11px] font-medium text-amber-800">Held: {shift.review_reason}</p> : <p className="text-[11px] text-slate-500">{formatR(shift.pay)}</p>}
                  </div>
                  <button type="button" onClick={() => setEditingShift({ shift_id: shift.shift_id, actual_start: asLocalInput(shift.actual_start), actual_end: asLocalInput(shift.actual_end), notes: shift.notes || "", rate_multiplier: shift.multiplier || 1 })} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Dialog open={!!editingShift} onOpenChange={(open) => !open && !shiftBusy && setEditingShift(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit driver shift</DialogTitle>
            <DialogDescription>Correct the clock times and notes. Changes are audit logged and refresh this settlement.</DialogDescription>
          </DialogHeader>
          {editingShift && (
            <div className="grid grid-cols-1 gap-3 py-1 sm:grid-cols-2">
              <div><Label htmlFor={`mobile-shift-start-${editingShift.shift_id}`}>Clock in</Label><Input id={`mobile-shift-start-${editingShift.shift_id}`} type="datetime-local" value={editingShift.actual_start} onChange={(e) => setEditingShift({ ...editingShift, actual_start: e.target.value })} className="mt-1 min-w-0 text-xs" /></div>
              <div><Label htmlFor={`mobile-shift-end-${editingShift.shift_id}`}>Clock out</Label><Input id={`mobile-shift-end-${editingShift.shift_id}`} type="datetime-local" value={editingShift.actual_end} onChange={(e) => setEditingShift({ ...editingShift, actual_end: e.target.value })} className="mt-1 min-w-0 text-xs" /></div>
              <div className="sm:col-span-2"><Label htmlFor={`mobile-shift-notes-${editingShift.shift_id}`}>Notes</Label><Input id={`mobile-shift-notes-${editingShift.shift_id}`} value={editingShift.notes} onChange={(e) => setEditingShift({ ...editingShift, notes: e.target.value })} className="mt-1" /></div>
              <div className="sm:col-span-2"><Label htmlFor={`mobile-shift-mult-${editingShift.shift_id}`}>Pay multiplier</Label><select id={`mobile-shift-mult-${editingShift.shift_id}`} value={String(editingShift.rate_multiplier)} onChange={(e) => setEditingShift({ ...editingShift, rate_multiplier: Number(e.target.value) })} className="mt-1 min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"><option value="1">1× standard</option><option value="1.5">1.5× overtime</option><option value="2">2× Sunday / public holiday</option></select></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingShift(null)} disabled={shiftBusy}>Cancel</Button>
            <Button size="sm" onClick={saveEditedShift} disabled={shiftBusy} className="bg-brand-primary text-white hover:bg-brand-primary/90">{shiftBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Save shift</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// TotalCard removed in the command-centre restructure; the KPI strip
// now uses the shared StatTile primitive from @/components/portal/ui.
