/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, TrendingUp, Users, DollarSign, Package, Clock, AlertCircle, CheckCircle, Loader2, Calendar, ShoppingCart, FileText } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { DashboardDateRange, resolvePreset, DateRange } from "@/components/dashboard/DashboardDateRange";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BusinessIntelligence } from "@/components/dashboard/BusinessIntelligence";
import { FirstStepsCard } from "@/components/admin/FirstStepsCard";
import { EmailProviderBanner } from "@/components/admin/EmailProviderBanner";
import { TodaysPulse } from "@/components/admin/TodaysPulse";
import { QuoteFollowupWidget } from "@/components/admin/QuoteFollowupWidget";
import { InventoryLowStockWidget } from "@/components/admin/InventoryLowStockWidget";
import { InventoryExpiryWidget } from "@/components/admin/InventoryExpiryWidget";
import { VehicleServiceDueWidget } from "@/components/admin/VehicleServiceDueWidget";
import { DeliverySlaWidget } from "@/components/admin/DeliverySlaWidget";
import { CleaningQueueWidget } from "@/components/admin/CleaningQueueWidget";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { LeadAgingWidget } from "@/components/admin/LeadAgingWidget";
import { TomorrowsEventsWidget } from "@/components/admin/TomorrowsEventsWidget";
import { PendingRefundsWidget } from "@/components/admin/PendingRefundsWidget";
import { OverdueInvoicesWidget } from "@/components/admin/OverdueInvoicesWidget";
import { RecentRatingsWidget } from "@/components/admin/RecentRatingsWidget";
import { ActiveStaffNowWidget } from "@/components/admin/ActiveStaffNowWidget";
import { CancelledOrdersWidget } from "@/components/admin/CancelledOrdersWidget";
import { TopClientsWidget } from "@/components/admin/TopClientsWidget";
import { NewLeadsTodayWidget } from "@/components/admin/NewLeadsTodayWidget";
import { RecentActivityWidget } from "@/components/admin/RecentActivityWidget";
import { DispatchGapWidget } from "@/components/admin/DispatchGapWidget";
import { WeeklyOrdersChart } from "@/components/admin/WeeklyOrdersChart";
import { EquipmentDamagesWidget } from "@/components/admin/EquipmentDamagesWidget";
import { RecentPaymentsWidget } from "@/components/admin/RecentPaymentsWidget";
import { RecentInventoryAdjustsWidget } from "@/components/admin/RecentInventoryAdjustsWidget";
import { RecentlyViewedWidget } from "@/components/admin/RecentlyViewedWidget";
import { EmailFailuresWidget } from "@/components/admin/EmailFailuresWidget";
import { MenuTopSellersWidget } from "@/components/admin/MenuTopSellersWidget";
import { QuoteResponseTimeWidget } from "@/components/admin/QuoteResponseTimeWidget";
import { RegionPerformanceWidget } from "@/components/admin/RegionPerformanceWidget";
import { YearOverYearCard } from "@/components/admin/YearOverYearCard";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

interface Stats {
  bookedRevenue: number;
  collectedRevenue: number;
  outstandingRevenue: number;
  bookedOrders: number;
  collectedOrders: number;
  activeOrders: number;
  upcomingEvents: number;
  totalOrdersInRange: number;
  completedOrdersInRange: number;
  averageOrderValue: number;
  completionRate: number;
  pendingQuotes: number;
  /** Quotes out for client response: sent / viewed / revised. Excludes
   *  drafts (still internal) and accepted/rejected/expired (closed). */
  quotesInCirculationCount: number;
  /** Sum of total_amount on the same in-circulation set. The number
   *  Bobby cares about: "how much money is sitting in conversion limbo". */
  quotesInCirculationValue: number;
  lowStockItems: number;
  activeUsers: number;
  cancelledOrdersInRange: number;
  refundsOutstandingCount: number;
  refundsOutstandingValue: number;
  topCancelReason: string;
  /** Phase 11 #7: sum of tax_amount on booked-and-onwards orders
   *  in the range. Lets the bookkeeper eyeball VAT exposure for
   *  the period without opening every invoice. */
  vatCollected: number;
  /** Phase 12 #6: quote conversion. accepted / closed in range. */
  quoteConversionRate: number;
  quoteConversionSample: number;
}

const EMPTY: Stats = {
  bookedRevenue: 0, collectedRevenue: 0, outstandingRevenue: 0,
  bookedOrders: 0, collectedOrders: 0, activeOrders: 0,
  upcomingEvents: 0, totalOrdersInRange: 0, completedOrdersInRange: 0,
  averageOrderValue: 0, completionRate: 0,
  pendingQuotes: 0, quotesInCirculationCount: 0, quotesInCirculationValue: 0,
  lowStockItems: 0, activeUsers: 0,
  cancelledOrdersInRange: 0, refundsOutstandingCount: 0,
  refundsOutstandingValue: 0, topCancelReason: "-",
  vatCollected: 0,
  quoteConversionRate: 0, quoteConversionSample: 0,
};

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready", "in_transit"];

function AdminDashboardPage() {
  const { user, profile, companySlug } = useAuth();
  const companyId = (profile as any)?.company_id || (user as any)?.company_id;
  // Wave 27: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();

  const [range, setRange] = useState<DateRange>(() => resolvePreset("this_month"));
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Phase 14 #2: tenant timezone hint chip in the dashboard
  // header. The date pickers + cron windows interpret event_date
  // in companies.timezone, but multi-region tenants couldn't
  // see which clock was driving the math.
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("timezone")
        .eq("id", companyId)
        .maybeSingle();
      if (error) {
        console.error("[admin/dashboard] companies.timezone fetch failed:", error);
      }
      if (!cancelled) setTenantTimezone((data as any)?.timezone || null);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Phase 11 #1: tenant currency on the main dashboard metric
  // cards. Resolves the symbol + locale from companies.currency
  // so a UK / US tenant sees their own currency on the revenue
  // headline. Falls back to ZAR / en-ZA so existing tenants are
  // unaffected.
  const tenantCurrency = useTenantCurrency(companyId);
  const fmt = useMemo(() => {
    const code = tenantCurrency.code;
    const localeMap: Record<string, string> = {
      ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE", AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE",
    };
    try {
      return new Intl.NumberFormat(localeMap[code] || "en-ZA", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    } catch {
      // Fallback to ZAR if Intl rejects the code.
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
    }
  }, [tenantCurrency.code]);

  const loadMetrics = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);

      const fromISO = toLocalISO(range.from);
      const toISO   = toLocalISO(range.to);
      const todayISO = toLocalISO(new Date());

      // Pull every order whose event falls in the range, plus the always-on
      // counters (low stock, pending quotes, team size) which don't bind to range.
      // Phase 12 #6: quote conversion rate. Pull every quote that
      // closed (accepted / rejected / expired) in the range so we
      // can compute accepted / (accepted + rejected + expired).
      // Drafts are excluded - they were never sent so their
      // outcome is undecided, not a 'loss'.
      const [ordersRes, quotesRes, quotesCirculatingRes, usersRes, invRes, conversionRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, status, payment_status, total_amount, tax_amount, deposit_paid, deposit_amount, balance_paid, balance_amount, amount_paid, event_date, confirmed_at, cancellation_reason_category")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", fromISO)
          .lte("event_date", toISO),
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["draft", "sent"]),
        // Quotes "in circulation" - out for client response, not yet
        // closed. Wave 70.52a fix: was filtering on ["sent", "viewed",
        // "revised"] but the quote_status enum only has draft, sent,
        // accepted, rejected, expired. The 'viewed' and 'revised'
        // values never existed - PostgREST rejected the filter and
        // the error was swallowed by the (only ordersRes.error
        // checked) pattern below, so the tile silently zeroed forever.
        // Filter on the one real "out for client" value: 'sent'.
        supabase
          .from("quotes")
          .select("total_amount")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["sent"]),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("inventory_items")
          .select("current_stock, minimum_stock")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        // Phase 12 #6: quote conversion sample. Pull every quote
        // closed (accepted / rejected / expired) in the date range
        // so we can render N accepted of M closed = X% conversion.
        supabase
          .from("quotes")
          .select("status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["accepted", "rejected", "expired"])
          .gte("updated_at", `${fromISO}T00:00:00`)
          .lte("updated_at", `${toISO}T23:59:59`),
      ]);

      if (ordersRes.error) throw ordersRes.error;

      // Wave 70.52a - surface (don't swallow) errors from every other
      // parallel query. Previously only ordersRes.error was re-thrown,
      // so a broken filter on any other res (e.g. the
      // quotes-in-circulation enum bug) silently zeroed the tile
      // forever and nobody noticed. console.warn keeps the page alive;
      // the affected tile renders its empty/zero state. Wave 70.52b
      // will surface this in a per-tile error chip.
      [
        ["quotesAll", quotesRes],
        ["quotesCirculating", quotesCirculatingRes],
        ["users", usersRes],
        ["inventory", invRes],
        ["closedQuotes", conversionRes],
      ].forEach(([label, res]: any) => {
        if (res?.error) console.warn(`[admin/dashboard] ${label} query failed (tile may show 0):`, res.error);
      });

      const orders = ordersRes.data || [];

      // - Revenue maths --------------------------------------------------
      // BOOKED: order is locked in (not cancelled, not draft) - the catering
      //   business has committed kitchen time. Counts for total_amount.
      // COLLECTED: money actually received so far. Sum of:
      //   - amount_paid when set
      //   - else deposit_amount when deposit_paid AND balance_amount when balance_paid
      //   - else total_amount when payment_status='paid' and no breakdown exists
      // OUTSTANDING = booked - collected for non-cancelled orders.

      let bookedRevenue = 0;
      let collectedRevenue = 0;
      let bookedOrders = 0;
      let collectedOrders = 0;
      // Phase 11 #7: VAT exposure across booked orders in the
      // selected range. Sums orders.tax_amount on the same
      // booked-set so the bookkeeper sees how much VAT the
      // period generated without opening each invoice.
      let vatCollected = 0;

      for (const o of orders) {
        const status = String(o.status || "").toLowerCase();
        const pay    = String(o.payment_status || "").toLowerCase();
        const total  = Number(o.total_amount || 0);

        // Wave 70.52a - Collected calc now runs FIRST, BEFORE the
        // cancelled `continue`. Previously the continue at this point
        // skipped cancelled orders entirely, so a cancelled order
        // with a banked deposit (e.g. R300 paid, then client
        // cancelled, no refund processed yet) was invisible in the
        // Collected tile. The cash IS in the bank; it stays in
        // Collected until a refund payment row is recorded (which
        // is when it should naturally disappear via the refund being
        // a negative payment). Booked-side calculation still legitly
        // excludes cancelled (no kitchen commitment, no VAT due).
        let received = 0;
        if (Number(o.amount_paid || 0) > 0) {
          received = Number(o.amount_paid);
        } else {
          if (o.deposit_paid && Number(o.deposit_amount || 0) > 0) received += Number(o.deposit_amount);
          if (o.balance_paid && Number(o.balance_amount || 0) > 0) received += Number(o.balance_amount);
          // If we have nothing recorded but the order is marked fully paid, take total
          if (received === 0 && pay === "paid") received = total;
        }
        if (received > 0) collectedOrders += 1;
        collectedRevenue += received;

        if (status === "cancelled") continue;

        // Booked: client has actually committed to the booking. Gate is
        // explicit confirmation, not status advancement - either the
        // deposit's been paid, the admin manually marked confirmed_at,
        // or money has come in (paid / partial).
        const isBooked =
          o.deposit_paid === true ||
          !!o.confirmed_at ||
          pay === "paid" ||
          pay === "partial";
        if (isBooked) {
          bookedRevenue += total;
          bookedOrders += 1;
          vatCollected += Number(o.tax_amount || 0);
        }
      }

      const outstandingRevenue = Math.max(0, bookedRevenue - collectedRevenue);

      const activeOrders = orders.filter((o: any) =>
        ACTIVE_STATUSES.includes(String(o.status || "").toLowerCase()),
      ).length;

      const upcomingEvents = orders.filter((o: any) => {
        const status = String(o.status || "").toLowerCase();
        return o.event_date >= todayISO && status !== "cancelled" && status !== "completed";
      }).length;

      const completedOrdersInRange = orders.filter((o: any) =>
        String(o.status || "").toLowerCase() === "completed",
      ).length;

      const totalOrdersInRange = orders.filter((o: any) =>
        String(o.status || "").toLowerCase() !== "cancelled",
      ).length;

      const averageOrderValue = bookedOrders > 0 ? bookedRevenue / bookedOrders : 0;
      const completionRate = totalOrdersInRange > 0
        ? (completedOrdersInRange / totalOrdersInRange) * 100
        : 0;

      const lowStockItems = (invRes.data || []).filter(
        (r: any) => Number(r.current_stock || 0) <= Number(r.minimum_stock || 0),
      ).length;

      // Phase 12 #6: quote conversion. Accepted ÷ (accepted + rejected
      // + expired) closed in the range. Skipped when the sample is
      // empty so the rate doesn't show a misleading 0%.
      const closedQuotes = (conversionRes.data || []) as Array<{ status: string }>;
      const closedAccepted = closedQuotes.filter((q) => q.status === "accepted").length;
      const closedTotal = closedQuotes.length;
      const quoteConversionRate = closedTotal > 0 ? (closedAccepted / closedTotal) * 100 : 0;
      const quoteConversionSample = closedTotal;

      // Cancellations + refunds tile data. Pulls cancelled orders in
      // the date window plus all pending refunds for this tenant
      // (refunds are queue-style - pending refunds are about
      // "what's outstanding right now", not bound to the date filter).
      const cancelledOrdersInRange = orders.filter((o: any) =>
        String(o.status || "").toLowerCase() === "cancelled",
      ).length;

      const reasonCounts: Record<string, number> = {};
      for (const o of orders) {
        if (String(o.status || "").toLowerCase() !== "cancelled") continue;
        const cat = (o as any).cancellation_reason_category || "other";
        reasonCounts[cat] = (reasonCounts[cat] || 0) + 1;
      }
      const topCancelReason = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0]
        ?.replace(/_/g, " ") || "-";

      // Phase 4B: read payment_status (enum) instead of legacy status text mirror.
      const { data: refundRows, error: refundRowsError } = await supabase
        .from("payments")
        .select("amount, payment_status")
        .eq("company_id", companyId)
        .eq("payment_type", "refund")
        .neq("payment_status", "completed");
      if (refundRowsError) {
        console.error("[admin/dashboard] payments refunds fetch failed:", refundRowsError);
      }
      const refundsOutstandingCount = (refundRows || []).length;
      const refundsOutstandingValue = (refundRows || []).reduce(
        (sum: number, r: any) => sum + (Number(r.amount) || 0),
        0,
      );

      const quotesInCirculationRows = (quotesCirculatingRes.data || []) as any[];
      const quotesInCirculationCount = quotesInCirculationRows.length;
      const quotesInCirculationValue = quotesInCirculationRows.reduce(
        (sum: number, q: any) => sum + (Number(q.total_amount) || 0),
        0,
      );

      setStats({
        bookedRevenue, collectedRevenue, outstandingRevenue,
        bookedOrders, collectedOrders,
        activeOrders, upcomingEvents,
        totalOrdersInRange, completedOrdersInRange,
        averageOrderValue, completionRate,
        pendingQuotes: quotesRes.count ?? 0,
        quotesInCirculationCount,
        quotesInCirculationValue,
        activeUsers: usersRes.count ?? 0,
        lowStockItems,
        cancelledOrdersInRange, refundsOutstandingCount,
        refundsOutstandingValue, topCancelReason,
        vatCollected,
        quoteConversionRate, quoteConversionSample,
      });
    } catch (err: any) {
      console.error("Dashboard load error:", err);
      setError(err?.message || "Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;
    loadMetrics();
    // Realtime: any order change refetches the current range.
    const sub = supabase
      .channel("admin-dashboard-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadMetrics())
      .subscribe();
    return () => { sub.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, range.from.getTime(), range.to.getTime()]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Admin Dashboard - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          {/* Header + date range, date controls every metric below */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Live metrics for events in <span className="font-semibold text-slate-900">{range.label}</span>
                  {tenantTimezone && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-slate-500 align-middle">
                      <Clock className="w-3 h-3" />
                      <span className="font-mono">{tenantTimezone}</span>
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
              <DashboardDateRange range={range} onChange={setRange} />
              <Button
                variant="outline"
                size="sm"
                onClick={loadMetrics}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Refresh
              </Button>
            </div>
          </div>

          {/* Operator safety net: if no email provider is wired up,
              every send silently fails. Show the banner directly under
              the header so it cannot be missed. Self-hides once
              email_settings is configured. */}
          {companyId ? (
            <WidgetErrorBoundary label="Email provider banner">
              <EmailProviderBanner companyId={companyId} />
            </WidgetErrorBoundary>
          ) : null}

          {/* Phase 9 #5: Today's pulse - live KPI strip with the
              numbers the dispatch lead actually checks every morning:
              today's confirmed events, in-transit deliveries, drivers
              on shift, kitchen prep load, money landed today. Refreshes
              every 60 seconds so the tab stays current. */}
          <WidgetErrorBoundary label="Today's pulse"><TodaysPulse companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 17 #8: recently-viewed shortcut. Tracks the last
              5 entities the operator opened across orders / quotes /
              contacts in localStorage so jumping back is one click.
              Self-hides until at least one entity is tracked. */}
          <WidgetErrorBoundary label="Recently viewed"><RecentlyViewedWidget /></WidgetErrorBoundary>

          {/* Phase 9 #10: quotes-to-chase widget. Surfaces the 5
              oldest in-play quotes sent more than 3 days ago without
              a reply, so the sales lead doesn't have to open the
              quotes page to find the rotting ones. Self-hides when
              there's nothing to chase. */}
          <WidgetErrorBoundary label="Quote follow-up"><QuoteFollowupWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 10 #4: inventory low-stock widget. Surfaces the
              top 5 items at or below their minimum reorder level so
              the shopping team gets a visual nudge straight from the
              dashboard. Self-hides when nothing is short. */}
          <WidgetErrorBoundary label="Low stock"><InventoryLowStockWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 12 #7: inventory expiry tracking. Batches with
              stock on hand expiring within 14 days, plus already-
              expired batches still showing quantity. Self-hides
              when nothing is close. */}
          <WidgetErrorBoundary label="Inventory expiry"><InventoryExpiryWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 16 #10: recent stock movements. Last 5
              inventory_transactions in the past 7 days so the
              shopping team coordinator sees activity at a
              glance without per-item drilling. */}
          <WidgetErrorBoundary label="Recent inventory adjusts"><RecentInventoryAdjustsWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 13 #4: fleet service due. Vehicles whose
              next_service_due lands within 30 days. Self-hides
              when no service is on the horizon. */}
          <WidgetErrorBoundary label="Vehicle service due"><VehicleServiceDueWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 13 #6: delivery on-time SLA. delivered_at vs
              event_time over the last 30 days, with a 15-min
              grace window. Self-hides on a fresh tenant. */}
          <WidgetErrorBoundary label="Delivery SLA"><DeliverySlaWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 13 #7: equipment cleaning queue. Items still
              in pending / cleaning / drying after returning from
              an event. Self-hides when the queue is empty.
              Wave 42 hotfix: error-boundary-wrapped because Wave 42
              Tier 2 rewrote this widget to read cleaning_jobs and a
              broken render here was wiping the entire dashboard. */}
          <WidgetErrorBoundary label="Cleaning queue">
            <CleaningQueueWidget companyId={companyId} />
          </WidgetErrorBoundary>

          {/* Phase 16 #2: equipment damages waiting on resolution.
              Self-hides when nothing is unresolved. */}
          <WidgetErrorBoundary label="Equipment damages"><EquipmentDamagesWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 22 #5: brand-new leads inside the last 24 hours.
              Pairs with LeadAgingWidget which surfaces the >3 day
              stragglers. Together they cover the funnel: 'who's
              fresh' on top, 'who's rotting' below. */}
          <WidgetErrorBoundary label="New leads today"><NewLeadsTodayWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 14 #1: lead aging. Active leads (not converted,
              not won/lost) older than 3 days, oldest first. Self-
              hides when nothing is overdue. */}
          <WidgetErrorBoundary label="Lead aging"><LeadAgingWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 14 #3: tomorrow's events. Compact list with
              earliest start time + driver assignment for the
              evening-before review. Self-hides on a quiet day. */}
          <WidgetErrorBoundary label="Tomorrow's events"><TomorrowsEventsWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 20 #5: who's on the clock right now. Today's
              Pulse shows the driver count but the kitchen +
              cleaning + shopping side was invisible. Lists open
              staff_work_sessions sorted by longest-running so
              stale clock-ins surface to the top. */}
          <WidgetErrorBoundary label="Active staff now"><ActiveStaffNowWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 14 #8: dispatch coverage gaps. Confirmed
              orders in the next 7 days with no driver
              assigned. Self-hides when every event is covered. */}
          <WidgetErrorBoundary label="Dispatch gaps"><DispatchGapWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 14 #9: weekly order load mini chart. Shows the
              past + next 7 days of confirmed-and-onwards orders
              by event date so the kitchen lead can spot bunching
              days at a glance. Self-hides on a fresh tenant. */}
          <WidgetErrorBoundary label="Weekly orders chart"><WeeklyOrdersChart companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 14 #6: pending refunds list. The stat tile
              showed total + count; this surfaces individual rows
              with client name + amount + age so the bookkeeper
              can act on the oldest first. */}
          <WidgetErrorBoundary label="Pending refunds"><PendingRefundsWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 19 #8: overdue invoices list. The matching surface
              for money waiting to come in - invoices past due_date
              that haven't been paid or cancelled, oldest first.
              Self-hides on a tenant with no overdue invoices. */}
          <WidgetErrorBoundary label="Overdue invoices"><OverdueInvoicesWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 19 #10: recent event ratings. Closes the loop on
              the Phase 18 #10 quick-rating capture in the order
              drawer - 30-day average plus the last 5 rated orders.
              Self-hides until a tenant has stamped at least one
              rating. */}
          <WidgetErrorBoundary label="Recent ratings"><RecentRatingsWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 20 #7: cancellations rollup. Surfaces the last 5
              cancelled orders plus the 30-day lost-revenue total so
              an owner sees patterns forming. Self-hides on a clean
              month. */}
          <WidgetErrorBoundary label="Cancelled orders"><CancelledOrdersWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 16 #9: recent payments collected. Today's Pulse
              shows 'Paid today' total but no row-level detail. This
              card surfaces the last 5 completed payments so the
              bookkeeper can reconcile against the bank deposit. */}
          <WidgetErrorBoundary label="Recent payments"><RecentPaymentsWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 14 #7: recent activity timeline. Pivoted from
              the brand-colour preview slot since live preview
              already exists on /admin/white-label. Shows the
              last 8 audit_logs entries so owners get a quick
              read on team activity from the dashboard. */}
          <WidgetErrorBoundary label="Recent activity"><RecentActivityWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 10 #7: email failures widget. Surfaces the last
              5 failed sends in the last 24h so quietly broken
              automations don't go unnoticed. Self-hides when there
              are no failures. */}
          <WidgetErrorBoundary label="Email failures"><EmailFailuresWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 11 #4: menu top-sellers. Shows the 5 dishes
              moving most across confirmed orders in the last 30
              days so the kitchen lead + sales lead see what's
              actually pulling. Self-hides on a fresh tenant. */}
          <WidgetErrorBoundary label="Menu top sellers"><MenuTopSellersWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 21 #6: top clients by spend over the last 30
              days. Retention surface for thank-yous, loyalty
              perks and follow-up. Groups orders by client_name
              and ranks the top 5 by total booked value. Self-
              hides on a tenant with no qualifying orders. */}
          <WidgetErrorBoundary label="Top clients"><TopClientsWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 11 #10: quote response time. Median sent->view
              and sent->accept across the last 90 days. Helps the
              sales lead spot pricing / tone problems separately
              from chase cadence. Self-hides without a sample. */}
          <WidgetErrorBoundary label="Quote response time"><QuoteResponseTimeWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 12 #2: per-branch revenue + order count
              comparison for multi-branch tenants. Self-hides on
              single-branch setups so it doesn't take up space. */}
          <WidgetErrorBoundary label="Region performance"><RegionPerformanceWidget companyId={companyId} /></WidgetErrorBoundary>

          {/* Phase 12 #4: year-over-year comparison. Same date
              window shifted back 12 months so the 'this month
              vs same month last year' read is one glance. Self-
              hides if the prior-year window is empty. */}
          <WidgetErrorBoundary label="Year over year">
            <YearOverYearCard
              companyId={companyId}
              range={range}
              thisYearRevenue={stats.bookedRevenue}
              thisYearOrders={stats.bookedOrders}
            />
          </WidgetErrorBoundary>

          {error && (
            <div className="mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
              <Button onClick={loadMetrics} size="sm" className="mt-2">Retry</Button>
            </div>
          )}

          {/* Day-zero "First Steps" card. Self-hides once required steps
              are in or the owner dismisses / completes onboarding. */}
          {companyId ? (
            <WidgetErrorBoundary label="First steps">
              <FirstStepsCard companyId={companyId} slug={companySlug || ""} />
            </WidgetErrorBoundary>
          ) : null}

          {/* Priority Actions, not date-bound, always-on attention items */}
          {(stats.pendingQuotes > 0 || stats.lowStockItems > 0 || stats.upcomingEvents > 0) && (
            <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-amber-50 to-orange-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  Priority Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {stats.pendingQuotes > 0 && (
                    <PriorityRow
                      icon={AlertCircle} accent="border-red-500" iconColor="text-red-600"
                      title={`${stats.pendingQuotes} Pending Quote${stats.pendingQuotes !== 1 ? "s" : ""}`}
                      sub="Require immediate attention"
                      // Wave 70.52a - withSlug() applied. Was passing raw
                      // /admin/quotes which 404s in multi-tenant routing.
                      cta={{ href: withSlug("/admin/quotes"), label: "Review", variant: "default" }}
                    />
                  )}
                  {stats.lowStockItems > 0 && (
                    <PriorityRow
                      icon={Package} accent="border-orange-500" iconColor="text-orange-600"
                      title={`${stats.lowStockItems} Low Stock Item${stats.lowStockItems !== 1 ? "s" : ""}`}
                      sub="Need restocking"
                      cta={{ href: withSlug("/admin/inventory"), label: "View", variant: "outline" }}
                    />
                  )}
                  {stats.upcomingEvents > 0 && (
                    <PriorityRow
                      icon={Calendar} accent="border-green-500" iconColor="text-green-600"
                      title={`${stats.upcomingEvents} Upcoming Event${stats.upcomingEvents !== 1 ? "s" : ""}`}
                      sub={`${stats.activeOrders} currently active in range`}
                      cta={{ href: withSlug("/admin/calendar"), label: "Calendar", variant: "outline" }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key revenue metrics, all bound to the date range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6">
            {/* Wave 70.52a - every MetricCard now carries an href so
                clicking drills to the dedicated surface for that
                number. Previously hover:shadow-xl made tiles look
                clickable while doing nothing. */}
            <MetricCard
              label="Booked Revenue"
              value={fmt.format(stats.bookedRevenue)}
              hint={`${stats.bookedOrders} confirmed booking${stats.bookedOrders === 1 ? "" : "s"}`}
              tooltip={`Total value of orders the client has confirmed for ${range.label.toLowerCase()}, either by paying a deposit or by being manually marked as confirmed by your team. Also includes orders with any payment recorded.\n\nPending, draft, and cancelled orders are excluded.`}
              icon={DollarSign}
              iconColor="text-green-600"
              badge={{ text: `${stats.bookedOrders} booked`, tone: "green" }}
              loading={loading}
              href={withSlug("/admin/orders?status=confirmed")}
            />
            <MetricCard
              label="Collected"
              value={fmt.format(stats.collectedRevenue)}
              hint={`Money received in ${range.label}`}
              tooltip={"Money actually banked from clients in this period. Includes deposits, partial payments and fully settled invoices. Cancelled-with-deposit cash stays counted here until a refund payment is recorded (Wave 70.52a).\n\nPulled from recorded payments on each order."}
              icon={CheckCircle}
              iconColor="text-emerald-600"
              badge={{ text: `${stats.collectedOrders} paid`, tone: "green" }}
              loading={loading}
              href={withSlug("/admin/financial-dashboard")}
            />
            <MetricCard
              label="Outstanding"
              value={fmt.format(stats.outstandingRevenue)}
              hint="Booked minus collected"
              tooltip={"What clients still owe you on confirmed bookings in this period. This is booked revenue less what you have already collected.\n\nUnpaid balances and partial deposits land here."}
              icon={TrendingUp}
              iconColor="text-blue-600"
              badge={{ text: "Owed", tone: "blue" }}
              loading={loading}
              href={withSlug("/admin/invoices")}
            />
            <MetricCard
              label="Active Orders"
              value={stats.activeOrders}
              hint="Currently in progress"
              tooltip={"Orders the kitchen and drivers are working on right now. Anything confirmed, in prep, ready, or out for delivery in this period."}
              icon={ShoppingCart}
              iconColor="text-purple-600"
              badge={{ text: "In progress", tone: "purple" }}
              loading={loading}
              href={withSlug("/admin/orders")}
            />
          </div>

          {/* Phase 11 #7 + Phase 12 #6: secondary stat row - VAT
              and quote conversion. Each tile self-hides when its
              underlying sample is empty so a fresh tenant doesn't
              see meaningless zeros. Renders the row only if at
              least one tile has data. */}
          {(stats.vatCollected > 0 || stats.quoteConversionSample > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6">
              {stats.vatCollected > 0 && (
                <MetricCard
                  label="VAT in range"
                  value={fmt.format(stats.vatCollected)}
                  hint="Tax on booked orders"
                  tooltip={"Sum of tax_amount on every booked order whose event_date falls in this range. Use this as a sanity-check against your accounting system's VAT control account for the period."}
                  icon={DollarSign}
                  iconColor="text-amber-600"
                  badge={{ text: "Period", tone: "amber" }}
                  loading={loading}
                  href={withSlug("/admin/financial-dashboard")}
                />
              )}
              {stats.quoteConversionSample > 0 && (
                <MetricCard
                  label="Quote conversion"
                  value={`${stats.quoteConversionRate.toFixed(0)}%`}
                  hint={`${stats.quoteConversionSample} closed in range${stats.quoteConversionSample < 5 ? " (small sample)" : ""}`}
                  tooltip={"Accepted ÷ closed quotes (accepted + rejected + expired) whose decision landed in this date range. Drafts are excluded - they were never sent so the outcome is undecided.\n\nSample size matters. A 100% rate over 1 closed quote means much less than 60% over 30."}
                  icon={CheckCircle}
                  iconColor="text-emerald-600"
                  badge={stats.quoteConversionSample < 5
                    ? { text: "Low n", tone: "amber" }
                    : { text: "Closed", tone: "green" }}
                  loading={loading}
                  href={withSlug("/admin/quotes")}
                />
              )}
            </div>
          )}

          {/* Pipeline tile - quotes that have been sent but not yet
              accepted or rejected. Both the count and the rand value
              matter: count tells the team how many follow-ups are due,
              value tells the owner how much pipeline is sitting in
              conversion limbo. Date-range independent (rolls all
              outstanding quotes, regardless of when they were sent). */}
          <div className="grid grid-cols-1 mb-6">
            <MetricCard
              label="Quotes in circulation"
              value={fmt.format(stats.quotesInCirculationValue)}
              hint={`${stats.quotesInCirculationCount} quote${stats.quotesInCirculationCount === 1 ? "" : "s"} sent, awaiting client response`}
              tooltip={"Total rand value of quotes sent to clients but not yet accepted or declined. Filters on the 'sent' status (Wave 70.52a fix - previously also queried for 'viewed' and 'revised' which don't exist in the quote_status enum; PostgREST silently rejected the filter and the tile read R0 forever).\n\nThis is your live pipeline. The bigger this is, the more revenue is sitting one client decision away."}
              icon={FileText}
              iconColor="text-amber-600"
              badge={stats.quotesInCirculationCount > 0 ? { text: "In play", tone: "amber" } : undefined}
              loading={loading}
              href={withSlug("/admin/quotes")}
            />
          </div>

          {/* Performance metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6">
            <MetricCard
              label="Avg Order Value"
              value={fmt.format(stats.averageOrderValue)}
              hint="Mean per booked order"
              tooltip={"Mean value per booked order in this period (cancelled orders excluded from both numerator and denominator). A higher number means bigger events or a richer mix."}
              icon={TrendingUp}
              iconColor="text-emerald-600"
              loading={loading}
              href={withSlug("/admin/financial-dashboard")}
            />
            <MetricCard
              label="Completion Rate"
              value={`${stats.completionRate.toFixed(1)}%`}
              hint={`${stats.completedOrdersInRange} of ${stats.totalOrdersInRange} done`}
              tooltip={"Share of orders in this period that finished as completed. Note: events in the future count against the denominator until they happen, so a normal Monday may show a low number even when nothing is wrong. Anything below 95% on already-happened events is worth a closer look."}
              icon={CheckCircle}
              iconColor="text-green-600"
              loading={loading}
              href={withSlug("/admin/orders")}
            />
            <MetricCard
              label="Upcoming Events"
              value={stats.upcomingEvents}
              hint="Today or later, not cancelled"
              tooltip={"Events in this period that are dated today or later and have not yet been completed or cancelled. What the team is heading into next.\n\nDifferent from Active Orders: Upcoming includes pending orders; Active counts only confirmed/preparing/ready/in_transit."}
              icon={Calendar}
              iconColor="text-indigo-600"
              loading={loading}
              href={withSlug("/admin/calendar")}
            />
            <MetricCard
              label="Team Members"
              value={stats.activeUsers}
              hint="Active users"
              tooltip={"Everyone attached to your company right now. This is your current team size and is not affected by the date filter."}
              icon={Users}
              iconColor="text-cyan-600"
              loading={loading}
              href={withSlug("/admin/users")}
            />
          </div>

          {/* Cancellations + refunds tile row. Surfaced separately so a
              spike in cancellations (or unpaid refund queue) is visible
              at a glance without having to drill into /admin/refunds. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6">
            <MetricCard
              label="Cancellations"
              value={stats.cancelledOrdersInRange}
              hint={`In ${range.label.toLowerCase()}`}
              tooltip={`Orders that ended up cancelled in ${range.label.toLowerCase()}. Top reason: ${stats.topCancelReason}.`}
              icon={Calendar}
              iconColor="text-rose-600"
              loading={loading}
              href={withSlug("/admin/orders?status=cancelled")}
            />
            <MetricCard
              label="Refunds Outstanding"
              value={fmt.format(stats.refundsOutstandingValue)}
              hint={`${stats.refundsOutstandingCount} pending payout${stats.refundsOutstandingCount === 1 ? "" : "s"} (all-time)`}
              tooltip={"Refunds that have been raised on cancellation but not yet paid out via EFT or gateway. This number is NOT bound to the date filter - it's the live queue regardless of when each refund was raised. Action them on /admin/refunds."}
              icon={DollarSign}
              iconColor="text-amber-600"
              loading={loading}
              href={withSlug("/admin/refunds")}
            />
            <MetricCard
              label="Top Cancel Reason"
              value={stats.topCancelReason || "-"}
              hint={stats.cancelledOrdersInRange === 0 ? "Nothing cancelled in range" : "Most common category"}
              tooltip={"The most common cancellation reason category for the date range. Useful for spotting patterns: e.g. lots of 'no_payment' tells you to tighten the deposit reminder cadence."}
              icon={AlertCircle}
              iconColor="text-orange-600"
              loading={loading}
              href={withSlug("/admin/orders?status=cancelled")}
            />
          </div>

          {/* Quick Actions */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Link
                  href={withSlug("/admin/orders")}
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 rounded-lg hover:shadow-md transition-all"
                >
                  <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Manage Orders</div>
                    <div className="text-xs text-slate-600">{stats.activeOrders} active in range</div>
                  </div>
                </Link>
                <Link
                  href={withSlug("/admin/users")}
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg hover:shadow-md transition-all"
                >
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Team Management</div>
                    <div className="text-xs text-slate-600">{stats.activeUsers} members</div>
                  </div>
                </Link>
                <Link
                  href={withSlug("/admin/financial-dashboard")}
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg hover:shadow-md transition-all"
                >
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Financial Reports</div>
                    <div className="text-xs text-slate-600">Deeper analytics</div>
                  </div>
                </Link>
                <Link
                  href={withSlug("/admin/inventory")}
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg hover:shadow-md transition-all"
                >
                  <div className="relative flex-shrink-0">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                    {stats.lowStockItems > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">
                        {stats.lowStockItems > 9 ? "9+" : stats.lowStockItems}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Inventory</div>
                    <div className="text-xs text-slate-600">
                      {stats.lowStockItems > 0
                        ? `${stats.lowStockItems} item${stats.lowStockItems !== 1 ? "s" : ""} low`
                        : "Add items + adjust stock"}
                    </div>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Business Intelligence - charts + insight cards. Lives at
              the bottom of the dashboard, collapsible, persists state per
              tenant. Owns its own data fetch (24-month window of orders +
              quotes + leads, narrowed by the global region filter). */}
          <WidgetErrorBoundary label="Business intelligence">
            <BusinessIntelligence companyId={companyId} dateRange={{ from: range.from, to: range.to }} />
          </WidgetErrorBoundary>
        </div>
      </div>

      <ChatBot userRole="admin" companyId={companyId} />
    </>
  );
}

function PriorityRow({
  icon: Icon, accent, iconColor, title, sub, cta,
}: any) {
  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-lg border-l-4 ${accent}`}>
      <div className="flex items-center gap-2 sm:gap-3">
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColor} flex-shrink-0`} />
        <div>
          <p className="font-semibold text-sm sm:text-base text-slate-900">{title}</p>
          <p className="text-xs text-slate-600">{sub}</p>
        </div>
      </div>
      <Link href={cta.href}>
        <Button size="sm" variant={cta.variant} className="w-full sm:w-auto">{cta.label}</Button>
      </Link>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <AdminDashboardPage />
    </ProtectedRoute>
  );
}
