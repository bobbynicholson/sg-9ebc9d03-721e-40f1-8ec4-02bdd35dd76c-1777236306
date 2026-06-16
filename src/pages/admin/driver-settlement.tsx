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
import { PortalShell, PortalHeader } from "@/components/portal/ui";
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
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [companyName, setCompanyName] = useState<string>("CateringMS");
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
    };
    method: DriverPayoutMethod;
    reference: string;
    notes: string;
    busy: boolean;
  }>(null);

  // Phase 4 #7: pull the company name once so per-driver payslips
  // have the right header. Cheap; one row, runs on mount.
  useEffect(() => {
    if (!user?.company_id) return;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", user.company_id)
        .maybeSingle();
      if ((data as any)?.company_name) setCompanyName((data as any).company_name);
    })().catch(() => { /* default name is fine */ });
  }, [user?.company_id]);

  useEffect(() => {
    if (preset === "last_7") { setFrom(daysAgoIso(7)); setTo(todayIso()); }
    else if (preset === "last_30") { setFrom(daysAgoIso(30)); setTo(todayIso()); }
    else if (preset === "month_to_date") { setFrom(startOfMonthIso()); setTo(todayIso()); }
    else if (preset === "last_month") { const r = lastMonthRange(); setFrom(r.from); setTo(r.to); }
  }, [preset]);

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
      try {
        let q = (supabase as any)
          .from("profiles")
          .select("id, full_name, email, is_active, deleted_at, region_id")
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
          is_active: !!d.is_active,
          is_removed: !!d.deleted_at,
        }));
        if (!cancelled) {
          setRows(drivers.map((d) => ({ driver: d, summary: null, loading: true })));
        }
      } catch (e) {
        captureException(e, {
          tags: { route: "/admin/driver-settlement", step: "load-drivers", companyId: user?.company_id },
        });
        toast({ title: "Could not load drivers", variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.company_id, regionFilterId, toast]);

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
              distance_pay: t.distance_pay,
              callout_pay: t.callout_pay,
              grand_total: t.grand_total,
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
    let hours = 0, hourlyPay = 0, distanceKm = 0, distancePay = 0, callout = 0, grand = 0;
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
    }
    return { hours, hourlyPay, distanceKm, distancePay, callout, grand, roster, active };
  }, [rows]);

  const exportCsv = () => {
    const header = [
      "Driver", "Email", "Hours", "Hourly pay", "Distance (km)", "Distance pay", "Callouts", "Callout pay", "Grand total",
      // DRV-B: settlement status + paid-at columns so finance can
      // reconcile against the rand totals already in the export.
      "Settlement status", "Paid at", "Paid method", "Paid reference",
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
        // Per-driver deliveries count is only known after the row
        // is expanded (bulk path drops the per-delivery array to
        // stay cheap). Use 0 as the conservative fallback.
        r.summary?.deliveries.length ?? 0,
        s.callout_pay.toFixed(2),
        s.grand_total.toFixed(2),
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
      },
      method: "eft",
      reference: "",
      notes: "",
      busy: false,
    });
  };

  const confirmMarkPaid = async () => {
    if (!payoutDialog || !user?.company_id) return;
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
        title: "Payout recorded",
        description: `${payoutDialog.driverName}: ${formatR(payoutDialog.totals.grand_total)} via ${payoutDialog.method}.`,
      });
      // Optimistic - the realtime channel will also fire but the
      // local map gets the new row immediately.
      setPayoutsByDriver((prev) => {
        const next = new Map(prev);
        next.set(paid.payout!.driver_id, paid.payout!);
        return next;
      });
      setPayoutDialog(null);
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
      if (!t || t.grand_total <= 0) return false;
      return payoutsByDriver.get(r.driver.id)?.status !== "paid";
    });
    if (candidates.length === 0) {
      toast({ title: "Nothing to settle", description: "Every driver with hours is already paid." });
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

  return (
    <>
      <NoIndexMeta />
      <Head><title>Driver settlement - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Driver Settlement"
            icon={Wallet}
            subtitle="Per-driver pay summary. Hourly, round-trip kilometres, callout fees, and the total owed for the period. Mark each driver as paid once the money's out."
          />

          {/* Period picker */}
          <Card className="border-0 shadow mb-6">
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-slate-500">Period</Label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as Preset)}
                  className="mt-1 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="last_7">Last 7 days</option>
                  <option value="last_30">Last 30 days</option>
                  <option value="month_to_date">This month</option>
                  <option value="last_month">Last month</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">From</Label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="mt-1 w-44" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">To</Label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="mt-1 w-44" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Sort by</Label>
                <select
                  value={driverSort}
                  onChange={(e) => setDriverSort(e.target.value as any)}
                  className="mt-1 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
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
              <div>
                <Label className="text-xs text-slate-500">Settlement</Label>
                <select
                  value={settledFilter}
                  onChange={(e) => setSettledFilter(e.target.value as "all" | "unsettled" | "settled")}
                  className="mt-1 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="all">All drivers</option>
                  <option value="unsettled">Unsettled only</option>
                  <option value="settled">Settled only</option>
                </select>
              </div>
              <div className="ml-auto flex gap-2">
                {/* Phase 28 #9: manual refresh. Bumps refreshTick
                    which the inner per-driver compute effect
                    already listens for; picks up shifts logged
                    or edited in another tab without changing
                    the period chips. */}
                <Button
                  variant="outline"
                  onClick={() => setRefreshTick((n) => n + 1)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </Button>
                {/* DRV-C: bulk Mark all paid. Walks every unsettled
                    row with a positive total, drafts + flips each
                    to paid via EFT in sequence. window.confirm is
                    the hurdle - one click, then confirm. */}
                <Button
                  variant="outline"
                  onClick={bulkMarkAllPaid}
                  disabled={bulkPayBusy || rows.length === 0}
                  title="Draft + mark all unsettled drivers as paid via EFT. Reversible per row."
                  className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                >
                  {bulkPayBusy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4 mr-2" />
                  )}
                  Mark all paid
                </Button>
                <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                  <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

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
              if (!t || t.grand_total <= 0) return false;
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
                        ? "border-emerald-300 text-emerald-700 bg-emerald-50"
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
                {owed === 0 && totals.active > 0 && (
                  <Badge
                    variant="outline"
                    className="px-3 py-1.5 text-sm border-emerald-300 text-emerald-700 bg-emerald-50"
                  >
                    <BadgeCheck className="w-3 h-3 mr-1" />
                    All settled for this period
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
                {renderDelta("Hours", hoursDelta)}
                {renderDelta("Total", grandDelta)}
              </div>
            );
          })()}

          {/* DRV-B: KPI strip.
              - "Active drivers" reads `active / roster` instead of
                the misleading "DRIVERS PAID = roster" pre-DRV-B.
              - Utilisation denominator is now `activeDrivers *
                days * 8` so a 5-driver tenant with one active
                driver doesn't drown the percentage to zero.
              - "Settled" tile shows progress through the cycle:
                drivers already marked paid this period vs. total
                drivers with non-zero totals.
              - Distance pay tile muted when zero so the eye stops
                being drawn to a flat R 0 number. */}
          {(() => {
            const days = Math.max(
              1,
              Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1,
            );
            const capacity = totals.active * days * 8;
            const pct = capacity > 0 ? Math.round((totals.hours / capacity) * 100) : 0;
            const utilTone =
              pct >= 70 ? "text-rose-600"
              : pct >= 50 ? "text-amber-600"
              : pct >= 25 ? "text-emerald-600"
              : "text-slate-500";
            const settledCount = rows.filter((r) => {
              const t = r.summary?.totals;
              if (!t || t.grand_total <= 0) return false;
              return payoutsByDriver.get(r.driver.id)?.status === "paid";
            }).length;
            const distanceMuted = totals.distancePay === 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
                <TotalCard
                  label="Active drivers"
                  value={`${totals.active} / ${totals.roster}`}
                />
                <TotalCard label="Hours" value={`${totals.hours.toFixed(1)}h`} icon={Clock} accent="text-blue-600" />
                <TotalCard
                  label="Utilisation"
                  value={capacity > 0 ? `${pct}%` : "-"}
                  icon={Clock}
                  accent={utilTone}
                />
                <TotalCard label="Hourly pay" value={formatR(totals.hourlyPay)} icon={Clock} accent="text-blue-600" />
                <TotalCard
                  label="Distance pay"
                  value={formatR(totals.distancePay)}
                  icon={Route}
                  accent={distanceMuted ? "text-slate-400" : "text-amber-600"}
                />
                <TotalCard
                  label="Settled this period"
                  value={`${settledCount} / ${totals.active}`}
                  icon={BadgeCheck}
                  accent={settledCount === totals.active && totals.active > 0 ? "text-emerald-700" : "text-slate-600"}
                />
                <TotalCard
                  label="Grand total"
                  value={formatR(totals.grand)}
                  accent="text-emerald-700"
                  emphasize
                />
              </div>
            );
          })()}

          {loadingDrivers ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading drivers...
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 text-center text-slate-500">
                No drivers configured yet. Add some on /admin/driver-management.
              </CardContent>
            </Card>
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
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-orange-600" />
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
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              <th className="text-left px-4 py-2 font-medium">Driver</th>
                              <th className="text-right px-4 py-2 font-medium">Hours</th>
                              <th className="text-right px-4 py-2 font-medium">Hourly pay</th>
                              <th
                                className="text-right px-4 py-2 font-medium"
                                title="Round-trip kilometres (kitchen to venue and back). Matches the round-trip math used to bill the client for delivery."
                              >
                                Distance
                              </th>
                              <th className="text-right px-4 py-2 font-medium">Distance pay</th>
                              <th className="text-right px-4 py-2 font-medium">Callouts</th>
                              <th className="text-right px-4 py-2 font-medium">Callout pay</th>
                              <th className="text-right px-4 py-2 font-medium">Total</th>
                              <th className="text-center px-2 py-2 font-medium">Status</th>
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
                                  companyName={companyName}
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
                    <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200 mt-2">
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
              <DialogFooter>
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
                  onClick={confirmMarkPaid}
                  disabled={!payoutDialog || payoutDialog.busy}
                  className="px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center gap-1.5 disabled:opacity-60"
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
  row, t, isOpen, onToggle, periodFrom, periodTo, companyId, companyName, currencyCode, formatR = formatRDefault, toast, actorUserId, onShiftChanged,
  payout, onMarkPaid, onReverse,
}: {
  row: SettlementRow;
  t: { hours_total: number; hourly_pay: number; distance_total_km: number; distance_pay: number; callout_pay: number; grand_total: number } | undefined;
  isOpen: boolean;
  onToggle: () => void;
  periodFrom: string;
  periodTo: string;
  companyId: string;
  companyName: string;
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
    // We only want to re-trigger when the user opens the row, not
    // on every period tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, row.driver.id, companyId]);

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
    setShiftBusy(true);
    try {
      const startIso = editingShift.actual_start ? new Date(editingShift.actual_start).toISOString() : null;
      const endIso = editingShift.actual_end ? new Date(editingShift.actual_end).toISOString() : null;
      const res = await driverPayService.updateShift(
        editingShift.shift_id,
        {
          actual_start: startIso as any,
          actual_end: endIso as any,
          notes: editingShift.notes.trim() || null,
          rate_multiplier: editingShift.rate_multiplier === 1 ? null : editingShift.rate_multiplier,
        },
        undefined,
        actorUserId ?? null,
      );
      if (!res.ok) throw new Error(res.error || "Update failed");
      toast({ title: "Shift updated", description: "Settlement totals will refresh." });
      setEditingShift(null);
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
      onShiftChanged?.();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    } finally {
      setShiftBusy(false);
    }
  };
  // Phase 4 #7: payslip download. jsPDF render of the same summary
  // the row above shows, so the operator can email or print one
  // per driver without re-keying anything.
  const handleDownload = async () => {
    // DRV-B: prefer the per-shift detail when loaded so the payslip
    // PDF has the full breakdown; fall back to the thin bulk
    // summary on a "PDF without expanding" tap.
    const summaryForPdf = detail || row.summary;
    if (!summaryForPdf) return;
    const { driverPayslipService } = await import("@/services/driverPayslipService");
    const blob = driverPayslipService.generatePayslipPdf(
      {
        companyName,
        driverName: row.driver.full_name,
        driverEmail: row.driver.email || null,
        periodFrom,
        periodTo,
        currencyCode,
      },
      summaryForPdf,
    );
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
    const summaryForPdf = detail || row.summary;
    if (!summaryForPdf || !row.driver.email) return;
    const { driverPayslipService } = await import("@/services/driverPayslipService");
    const blob = driverPayslipService.generatePayslipPdf(
      {
        companyName,
        driverName: row.driver.full_name,
        driverEmail: row.driver.email,
        periodFrom,
        periodTo,
        currencyCode,
      },
      summaryForPdf,
    );
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
  // DRV-B: per-driver settlement chip. payout state comes from the
  // parent map (already loaded once per period change). Reverse
  // action only on the paid state.
  const isPaid = payout?.status === "paid";
  return (
    <>
      <tr id={`driver-row-${row.driver.id}`} className="border-t border-slate-100 hover:bg-slate-50">
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
            <td className="px-4 py-3 text-right tabular-nums">{t.hours_total.toFixed(2)}h</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatR(t.hourly_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{t.distance_total_km.toFixed(1)} km</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatR(t.distance_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{detailSummary?.deliveries.length ?? "-"}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatR(t.callout_pay)}</td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{formatR(t.grand_total)}</td>
          </>
        )}
        {/* DRV-B settlement status column. Paid = green chip with
            paid_at; Reviewed = amber; otherwise an action button to
            open the mark-as-paid dialog. Empty when there's nothing
            to settle (zero total). */}
        <td className="px-2 py-3 text-center">
          {!hasPay ? (
            <span className="text-[10px] text-slate-300">-</span>
          ) : isPaid ? (
            <button
              type="button"
              onClick={() => onReverse(payout!.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
              title={`Paid via ${payout!.paid_method || "-"}${payout!.paid_reference ? ` (${payout!.paid_reference})` : ""}. Click to reverse.`}
            >
              <BadgeCheck className="w-3 h-3" /> Paid
            </button>
          ) : (
            <button
              type="button"
              onClick={onMarkPaid}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-700 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
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
                try { await handleDownload(); } finally { setPdfBusy(false); }
              }}
              disabled={!hasPay || pdfBusy}
              title={hasPay ? "Download payslip PDF" : "No pay this period"}
            >
              <Download className="w-3 h-3" /> {pdfBusy ? "..." : "PDF"}
            </Button>
            {row.driver.email && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={!hasPay || emailBusy}
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
                title={hasPay ? "Email this payslip to the driver" : "No pay this period"}
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
                        <li key={s.shift_id} className="border-l-2 border-slate-200 pl-2 group">
                          <div className="flex justify-between items-start gap-2">
                            <span className="flex-1">
                              {s.hours.toFixed(2)}h @ {formatR(s.hourly_rate)}/hr{" "}
                              {hasMultiplier && (
                                <span className="text-amber-700 font-medium">× {s.multiplier}</span>
                              )}
                              {hasOvertime && (
                                <span className="text-amber-700 font-medium"> (includes overtime)</span>
                              )}
                            </span>
                            <span className="font-medium tabular-nums">{formatR(s.pay)}</span>
                            {/* Phase 8 #1: admin edit / soft-delete
                                actions per shift. Visible on hover
                                so they don't crowd the row. Audit log
                                handled inside driverPayService. */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 -my-0.5">
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
                      <li key={d.order_id} className="flex justify-between">
                        {/* ODOC G.4: each delivery jumps into the
                            doc for reconciliation context. */}
                        <Link
                          href={withSlug(staffOrderHref(d.order_id, "admin"))}
                          className="font-mono text-blue-700 hover:underline"
                        >
                          {d.order_id.slice(0, 8)}...
                        </Link>
                        <span>{d.distance_km.toFixed(1)} km · {formatR(d.total)}</span>
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
 * + status + actions in a stacked layout. Per-shift / per-delivery
 * drilldown intentionally lives on desktop only - on a phone the
 * operator is looking at "who do I still owe?", not "audit this
 * specific shift".
 */
function DriverSettlementCard({
  row, payout, onMarkPaid, onReverse, formatR = formatRDefault,
}: {
  row: SettlementRow;
  payout: DriverPayoutRow | null;
  onMarkPaid: () => void;
  onReverse: (payoutId: string) => void;
  /** TIGHTEN I.107: tenant-aware money formatter passed from parent. */
  formatR?: (n: number) => string;
}) {
  const t = row.summary?.totals;
  const hasPay = !!(t && t.grand_total > 0);
  const isPaid = payout?.status === "paid";
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
              <p className="text-lg font-bold text-emerald-700 tabular-nums">{formatR(t.grand_total)}</p>
              <p className="text-[11px] text-slate-500 tabular-nums">{t.hours_total.toFixed(2)}h</p>
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
          </div>
          <div>
            <div className="text-slate-400 uppercase tracking-wide text-[9px]">Callouts</div>
            <div className="tabular-nums">{formatR(t.callout_pay)}</div>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        {!hasPay ? (
          <span className="text-[11px] text-slate-400">Nothing to settle</span>
        ) : isPaid ? (
          <button
            type="button"
            onClick={() => onReverse(payout!.id)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            <BadgeCheck className="w-3 h-3" /> Paid - tap to reverse
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkPaid}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CircleDashed className="w-3 h-3" /> Mark as paid
          </button>
        )}
      </div>
    </div>
  );
}

function TotalCard({
  label, value, icon: Icon, accent, emphasize,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: string;
  emphasize?: boolean;
}) {
  return (
    <Card className={`border-0 shadow ${emphasize ? "ring-2 ring-emerald-200" : ""}`}>
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{label}</p>
        <div className="flex items-center gap-2 mt-1">
          {Icon && <Icon className={`w-4 h-4 ${accent || "text-slate-500"}`} />}
          <p className={`text-xl font-bold tabular-nums ${accent || "text-slate-900"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
