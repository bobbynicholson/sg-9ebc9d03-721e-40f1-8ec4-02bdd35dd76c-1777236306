/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, TrendingUp, Users, Banknote, Package, Clock, AlertCircle, CheckCircle, Loader2, Calendar, ShoppingCart, FileText } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { supabase } from "@/integrations/supabase/client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { canAccessFinance } from "@/lib/authGuards";
import { isBookedRevenue } from "@/lib/orderRevenueClassification";
import { DashboardDateRange, resolvePreset, DateRange } from "@/components/dashboard/DashboardDateRange";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BusinessIntelligence } from "@/components/dashboard/BusinessIntelligence";
import { FirstStepsCard } from "@/components/admin/FirstStepsCard";
import { FirstEventWalkthrough } from "@/components/admin/FirstEventWalkthrough";
import { EmailProviderBanner } from "@/components/admin/EmailProviderBanner";
import { TodaysPulse } from "@/components/admin/TodaysPulse";
import { QuoteFollowupWidget } from "@/components/admin/QuoteFollowupWidget";
import { InventoryLowStockWidget } from "@/components/admin/InventoryLowStockWidget";
import { InventoryExpiryWidget } from "@/components/admin/InventoryExpiryWidget";
import { VehicleServiceDueWidget } from "@/components/admin/VehicleServiceDueWidget";
import { DeliverySlaWidget } from "@/components/admin/DeliverySlaWidget";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
import { LeadAgingWidget } from "@/components/admin/LeadAgingWidget";
import { TomorrowsEventsWidget } from "@/components/admin/TomorrowsEventsWidget";
import { PendingRefundsWidget } from "@/components/admin/PendingRefundsWidget";
import { OverdueInvoicesWidget } from "@/components/admin/OverdueInvoicesWidget";
import { RecentRatingsWidget } from "@/components/admin/RecentRatingsWidget";
import { ActiveStaffNowWidget } from "@/components/admin/ActiveStaffNowWidget";
import { CancelledOrdersWidget } from "@/components/admin/CancelledOrdersWidget";
import { NewLeadsTodayWidget } from "@/components/admin/NewLeadsTodayWidget";
import { RecentActivityWidget } from "@/components/admin/RecentActivityWidget";
import { DispatchGapWidget } from "@/components/admin/DispatchGapWidget";
import { WeeklyOrdersChart } from "@/components/admin/WeeklyOrdersChart";
import { EquipmentDamagesWidget } from "@/components/admin/EquipmentDamagesWidget";
import { RecentPaymentsWidget } from "@/components/admin/RecentPaymentsWidget";
import { RecentInventoryAdjustsWidget } from "@/components/admin/RecentInventoryAdjustsWidget";
import { EmailFailuresWidget } from "@/components/admin/EmailFailuresWidget";
import { QuoteResponseTimeWidget } from "@/components/admin/QuoteResponseTimeWidget";
import { RegionPerformanceWidget } from "@/components/admin/RegionPerformanceWidget";
import { YearOverYearCard } from "@/components/admin/YearOverYearCard";
import { CashflowSnapshotWidget } from "@/components/admin/CashflowSnapshotWidget";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { DEFAULT_TENANT_TIMEZONE, tenantToday, toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { isAutomatedTestOrder, isAutomatedTestQuote } from "@/lib/testDataDetection";
import { OPEN_REFUND_STATUSES } from "@/lib/refundStatus";

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
  /** Wave 70.56: split breakdown of pendingQuotes so the Priority
   *  Actions row can say "X drafts to finish + Y awaiting client" -
   *  the original "1 pending quote / Require immediate attention"
   *  copy was misleading on a quote that was sent and waiting on
   *  the client (admin can't action it from the dashboard). */
  pendingQuoteDrafts: number;
  pendingQuoteSent: number;
  /** Wave 70.56: items in 'shortfall' status from the demand
   *  outlook view - confirmed/preparing/ready orders in the next 7
   *  days need more than we have. Drives the new top Priority
   *  Actions row (highest-urgency signal on the dashboard). */
  shortfallItems: number;
  /** Wave 70.56: ISO date of the earliest upcoming event so the
   *  Priority Actions row can say "Next: Sat 23 May" instead of
   *  conflating with activeOrders. */
  nextEventDate: string | null;
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
  testOrdersInRange: number;
  testRevenueInRange: number;
}

const EMPTY: Stats = {
  bookedRevenue: 0, collectedRevenue: 0, outstandingRevenue: 0,
  bookedOrders: 0, collectedOrders: 0, activeOrders: 0,
  upcomingEvents: 0, totalOrdersInRange: 0, completedOrdersInRange: 0,
  averageOrderValue: 0, completionRate: 0,
  pendingQuotes: 0, quotesInCirculationCount: 0, quotesInCirculationValue: 0,
  lowStockItems: 0,
  pendingQuoteDrafts: 0, pendingQuoteSent: 0,
  shortfallItems: 0, nextEventDate: null,
  activeUsers: 0,
  cancelledOrdersInRange: 0, refundsOutstandingCount: 0,
  refundsOutstandingValue: 0, topCancelReason: "-",
  vatCollected: 0,
  quoteConversionRate: 0, quoteConversionSample: 0,
  testOrdersInRange: 0, testRevenueInRange: 0,
};

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready", "in_transit"];

function AdminDashboardPage() {
  const { user, profile, companySlug } = useAuth();
  const companyId = (profile as any)?.company_id || (user as any)?.company_id;
  // AD-6 audit follow-up (2026-05-26): route gating for the Cashflow
  // Snapshot + the Financial Reports Quick Action goes through
  // canAccessFinance so this page can't surface a tile that the
  // downstream route blocks. The previous inline check incorrectly
  // allowed UserRole.ADMIN which canAccessRoute / FINANCE_ROUTES
  // refuses on /admin/financial-dashboard - admin would see the
  // snapshot, click the CTA, and land on a 403.
  const activeRole = String(
    (user as any)?.active_role || (profile as any)?.role || "",
  ).toLowerCase() as UserRole;
  const canSeeFinance = canAccessFinance(activeRole);
  // Wave 27: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();

  const [range, setRange] = useState<DateRange>(() => resolvePreset("this_month"));
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Silent-failure audit (Wave 70.52b): when one of the parallel tile
  // queries fails we keep the page alive but flag which tiles may be
  // showing 0 instead of leaving the operator to guess.
  const [tileWarning, setTileWarning] = useState<string | null>(null);
  // AD-7 (admin-dashboard audit): derived flag for "this tenant
  // has no data yet". Used both for the hero render at the top
  // of the page and to suppress the duplicate FirstStepsCard
  // render at the bottom.
  const isFreshTenant = !loading
    && stats.totalOrdersInRange === 0
    && stats.bookedOrders === 0
    && stats.upcomingEvents === 0
    && stats.pendingQuotes === 0
    && stats.lowStockItems === 0
    && (stats.activeUsers || 0) <= 1;
  // Phase 14 #2: tenant timezone hint chip in the dashboard
  // header. The date pickers + cron windows interpret event_date
  // in companies.timezone, but multi-region tenants couldn't
  // see which clock was driving the math.
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  const effectiveTenantTimezone = tenantTimezone || DEFAULT_TENANT_TIMEZONE;
  const tenantDateAnchor = useMemo(
    () => tenantToday(effectiveTenantTimezone),
    [effectiveTenantTimezone],
  );
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
      if (!cancelled) setTenantTimezone((data as any)?.timezone || DEFAULT_TENANT_TIMEZONE);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!tenantTimezone) return;
    setRange((prev) => (
      prev.presetId === "custom"
        ? prev
        : resolvePreset(prev.presetId, tenantToday(tenantTimezone))
    ));
  }, [tenantTimezone]);

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
  const testOrdersReviewHref = useMemo(() => {
    const params = new URLSearchParams({
      q: "E2E-ORD",
      dateFilter: "custom",
      from: toLocalISO(range.from),
      to: toLocalISO(range.to),
      view: "timeline",
    });
    return withSlug(`/admin/orders?${params.toString()}`);
  }, [range.from, range.to, withSlug]);

  const loadMetrics = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      setTileWarning(null);

      const fromISO = toLocalISO(range.from);
      const toISO   = toLocalISO(range.to);
      const todayISO = toLocalISO(tenantToday(effectiveTenantTimezone));

      // Pull every order whose event falls in the range, plus the always-on
      // counters (low stock, pending quotes, team size) which don't bind to range.
      // Phase 12 #6: quote conversion rate. Pull every quote that
      // closed (accepted / rejected / expired) in the range so we
      // can compute accepted / (accepted + rejected + expired).
      // Drafts are excluded - they were never sent so their
      // outcome is undecided, not a 'loss'.
      const [ordersRes, quotesRes, quotesCirculatingRes, usersRes, invRes, conversionRes, draftsRes, shortfallRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, event_name, internal_notes, status, payment_status, total_amount, tax_amount, deposit_paid, deposit_amount, balance_paid, balance_amount, amount_paid, event_date, confirmed_at, cancelled_at, cancellation_reason_category")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("event_date", fromISO)
          .lte("event_date", toISO),
        supabase
          .from("quotes")
          .select("id, status, quote_number, quote_name, client_name, notes")
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
          .select("total_amount, quote_number, quote_name, client_name, notes")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["sent"]),
        // Team Members tile: count only profiles that are actually
        // on the team right now. Previously this counted every row
        // attached to the company including soft-deleted (deleted_at
        // set) and explicitly deactivated (is_active=false) members,
        // so an offboarded driver kept inflating the headline. Filter
        // is "active or unset, and not soft-deleted" - `is_active`
        // is nullable on legacy rows, so `.or(...)` keeps those
        // visible while excluding rows explicitly marked inactive.
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .or("is_active.is.null,is_active.eq.true"),
        supabase
          .from("inventory_items")
          .select("current_stock, minimum_stock")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        // Phase 12 #6: quote conversion sample. Pull every quote
        // closed (accepted / rejected / expired) in the date range
        // so we can render N accepted of M closed = X% conversion.
        //
        // TIGHTEN I.71 (2026-06-01): also fetch lost_reason +
        // converted_to_order_id so we can separate "clean wins"
        // from "won then cancelled" (which post-I.62 keeps
        // status='accepted' + lost_reason='order_cancelled'). The
        // conversion rate now reports NET of cancellations - i.e.
        // wins that actually stuck - which matches operator
        // intuition for "what percentage of my deals turn into
        // real revenue".
        supabase
          .from("quotes")
          .select("status, lost_reason, converted_to_order_id, quote_number, quote_name, client_name, notes")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["accepted", "rejected", "expired"])
          .gte("updated_at", `${fromISO}T00:00:00`)
          .lte("updated_at", `${toISO}T23:59:59`),
        // Wave 70.56: split drafts from sent in the pending pool so
        // the Priority Actions row can say the right thing for each
        // ("drafts to finish" vs "sent, awaiting client").
        supabase
          .from("quotes")
          .select("id, quote_number, quote_name, client_name, notes")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("status", "draft"),
        // Wave 70.56: count items in 'shortfall' status from the
        // demand-outlook view (confirmed orders in next 7 days
        // need more than we have). RLS on the underlying tables
        // scopes the view to this tenant.
        (supabase as any)
          .from("inventory_demand_outlook")
          .select("inventory_item_id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("status", "shortfall"),
      ]);

      if (ordersRes.error) throw ordersRes.error;

      // Wave 70.52a - surface (don't swallow) errors from every other
      // parallel query. Previously only ordersRes.error was re-thrown,
      // so a broken filter on any other res (e.g. the
      // quotes-in-circulation enum bug) silently zeroed the tile
      // forever and nobody noticed. console.warn keeps the page alive;
      // the affected tile renders its empty/zero state. Wave 70.52b:
      // collect the failures and surface a "some tiles failed" banner.
      const failedTiles: string[] = [];
      [
        ["quotesAll", quotesRes],
        ["quotesCirculating", quotesCirculatingRes],
        ["users", usersRes],
        ["inventory", invRes],
        ["closedQuotes", conversionRes],
        ["draftQuotes", draftsRes],
        ["shortfall", shortfallRes],
      ].forEach(([label, res]: any) => {
        if (res?.error) {
          console.warn(`[admin/dashboard] ${label} query failed (tile may show 0):`, res.error);
          failedTiles.push(label);
        }
      });

      const orders = ordersRes.data || [];
      const testOrders = orders.filter((o: any) => isAutomatedTestOrder(o));
      const metricOrders = orders.filter((o: any) => !isAutomatedTestOrder(o));
      const testOrdersInRange = testOrders.length;
      const testRevenueInRange = testOrders.reduce(
        (sum: number, o: any) => sum + (isBookedRevenue(o) ? Number(o.total_amount || 0) : 0),
        0,
      );

      // Revenue maths
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

      // TIGHTEN I.70 (2026-06-01): routed through the canonical
      // isBookedRevenue helper so the dashboard tile, BI chart, YoY
      // card and region performance all reach the same answer for
      // the same row. Auditors flagged 6 divergent "Revenue"
      // definitions across the platform - this is the first widget
      // adopting the shared classifier.
      for (const o of metricOrders) {
        const pay    = String(o.payment_status || "").toLowerCase();
        const total  = Number(o.total_amount || 0);

        // Wave 70.52a - Collected calc still runs BEFORE the
        // cancelled-skip because a cancelled order with a banked
        // deposit IS cash in the bank; it stays in Collected until a
        // refund payment row is recorded (negative payment naturally
        // removes it).
        let received = 0;
        if (Number(o.amount_paid || 0) > 0) {
          received = Number(o.amount_paid);
        } else {
          if (o.deposit_paid && Number(o.deposit_amount || 0) > 0) received += Number(o.deposit_amount);
          if (o.balance_paid && Number(o.balance_amount || 0) > 0) received += Number(o.balance_amount);
          if (received === 0 && (pay === "paid" || pay === "completed")) received = total;
        }
        if (received > 0) collectedOrders += 1;
        collectedRevenue += received;

        if (isBookedRevenue(o)) {
          bookedRevenue += total;
          bookedOrders += 1;
          vatCollected += Number(o.tax_amount || 0);
        }
      }

      const outstandingRevenue = Math.max(0, bookedRevenue - collectedRevenue);

      const activeOrders = metricOrders.filter((o: any) =>
        ACTIVE_STATUSES.includes(String(o.status || "").toLowerCase()) && !o.cancelled_at,
      ).length;

      // Wave 70.56: also compute the earliest-event date so the
      // Priority Actions row can say "Next: Sat 23 May" instead of
      // the misleading "X currently active in range" sub it had
      // before (which conflated upcoming with activeOrders).
      const upcomingOrders = metricOrders.filter((o: any) => {
        const status = String(o.status || "").toLowerCase();
        return o.event_date >= todayISO
          && status !== "cancelled"
          && status !== "completed"
          && status !== "delivered"
          && !o.cancelled_at;
      });
      const upcomingEvents = upcomingOrders.length;
      const nextEventDate = upcomingOrders.length === 0
        ? null
        : upcomingOrders
          .map((o: any) => String(o.event_date))
          .sort()[0];

      // TIGHTEN I.63 (2026-06-01): the prior completion-rate KPI
      // counted ONLY status='completed' as completed - which
      // requires the auto-complete-delivered cron to have run.
      // 'delivered' is a successful operational outcome too (driver
      // dropped the food off; the cron just hasn't yet flipped the
      // status). Every other widget (funnel stage 5, branch spider,
      // capacity grid, top clients, weekly orders) treats delivered
      // as positive. The dashboard KPI was the outlier, undercounting
      // by all freshly-delivered orders not yet auto-completed.
      //
      // Also broadened the cancelled check to include cancelled_at
      // as a defensive OR. Auditors found inconsistency across
      // widgets - some use status only, some use the stamp, some use
      // both. Now this KPI uses both so a reverted-status-with-stamp
      // edge case stays excluded from the denominator.
      const completedOrdersInRange = metricOrders.filter((o: any) => {
        const s = String(o.status || "").toLowerCase();
        return (s === "completed" || s === "delivered") && !o.cancelled_at;
      }).length;

      const totalOrdersInRange = metricOrders.filter((o: any) => {
        const s = String(o.status || "").toLowerCase();
        return s !== "cancelled" && !o.cancelled_at;
      }).length;

      const averageOrderValue = bookedOrders > 0 ? bookedRevenue / bookedOrders : 0;
      const completionRate = totalOrdersInRange > 0
        ? (completedOrdersInRange / totalOrdersInRange) * 100
        : 0;

      // Wave 70.56: low-stock count now matches the smart widget's
      // definition - an item only counts as "low" if a minimum_stock
      // threshold has actually been configured (> 0) AND current is at
      // or below it. Previously the filter was current <= min with no
      // min > 0 guard, so a freshly-imported item with stock=0 and no
      // threshold (the bulk of a new tenant's catalogue) counted as
      // low - the Priority Actions row read "38 Low Stock Items" for
      // Spit Braai when the real count was 19.
      const lowStockItems = (invRes.data || []).filter(
        (r: any) => Number(r.minimum_stock || 0) > 0
          && Number(r.current_stock || 0) <= Number(r.minimum_stock || 0),
      ).length;

      // Phase 12 #6 / TIGHTEN I.71: quote conversion = wins that
      // STUCK divided by all closed quotes. Excludes won-then-
      // cancelled from the numerator so a tenant whose orders keep
      // getting cancelled stops seeing inflated win rates. Won-then-
      // cancelled = status='accepted' + lost_reason='order_cancelled'
      // (the I.62 marker).
      const closedQuotes = (conversionRes.data || []) as Array<{
        status: string;
        lost_reason: string | null;
        converted_to_order_id: string | null;
      }>;
      const liveClosedQuotes = closedQuotes.filter((q: any) => !isAutomatedTestQuote(q));
      const liveCleanWins = liveClosedQuotes.filter(
        (q) => q.status === "accepted" && q.lost_reason !== "order_cancelled",
      ).length;
      const closedTotal = liveClosedQuotes.length;
      const quoteConversionRate = closedTotal > 0 ? (liveCleanWins / closedTotal) * 100 : 0;
      const quoteConversionSample = closedTotal;

      // Cancellations + refunds tile data. Pulls cancelled orders in
      // the date window plus all pending refunds for this tenant
      // (refunds are queue-style - pending refunds are about
      // "what's outstanding right now", not bound to the date filter).
      const cancelledOrdersInRange = metricOrders.filter((o: any) =>
        String(o.status || "").toLowerCase() === "cancelled" || !!o.cancelled_at,
      ).length;

      const reasonCounts: Record<string, number> = {};
      for (const o of metricOrders) {
        if (String(o.status || "").toLowerCase() !== "cancelled" && !o.cancelled_at) continue;
        const cat = (o as any).cancellation_reason_category || "other";
        reasonCounts[cat] = (reasonCounts[cat] || 0) + 1;
      }
      const topCancelReason = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0]
        ?.replace(/_/g, " ") || "-";

      // Phase 4B: read payment_status (enum) instead of legacy status text mirror.
      const { data: refundRows, error: refundRowsError } = await supabase
        .from("payments")
        .select("amount, payment_status, order:order_id ( order_number, event_name, internal_notes, client_name )")
        .eq("company_id", companyId)
        .eq("payment_type", "refund")
        .in("payment_status", OPEN_REFUND_STATUSES);
      if (refundRowsError) {
        console.error("[admin/dashboard] payments refunds fetch failed:", refundRowsError);
        failedTiles.push("refunds");
      }
      // Partial-failure banner: the page still renders, but the
      // operator is told which tiles may be reading 0 by mistake.
      setTileWarning(
        failedTiles.length
          ? `Some dashboard tiles failed to load and may show 0 (${failedTiles.join(", ")}). Refresh to retry.`
          : null,
      );
      const liveRefundRows = (refundRows || []).filter((r: any) => !isAutomatedTestOrder(r.order));
      const refundsOutstandingCount = liveRefundRows.length;
      const refundsOutstandingValue = liveRefundRows.reduce(
        (sum: number, r: any) => sum + Math.abs(Number(r.amount) || 0),
        0,
      );

      const quotesInCirculationRows = ((quotesCirculatingRes.data || []) as any[])
        .filter((q: any) => !isAutomatedTestQuote(q));
      const quotesInCirculationCount = quotesInCirculationRows.length;
      const quotesInCirculationValue = quotesInCirculationRows.reduce(
        (sum: number, q: any) => sum + (Number(q.total_amount) || 0),
        0,
      );

      const pendingQuoteRows = ((quotesRes.data || []) as any[]).filter((q: any) => !isAutomatedTestQuote(q));
      const pendingQuoteDrafts = ((draftsRes.data || []) as any[]).filter((q: any) => !isAutomatedTestQuote(q)).length;
      const pendingQuoteSent = quotesInCirculationCount; // already filters status='sent'
      const shortfallItems = shortfallRes?.count ?? 0;

      setStats({
        bookedRevenue, collectedRevenue, outstandingRevenue,
        bookedOrders, collectedOrders,
        activeOrders, upcomingEvents,
        totalOrdersInRange, completedOrdersInRange,
        averageOrderValue, completionRate,
        pendingQuotes: pendingQuoteRows.length,
        quotesInCirculationCount,
        quotesInCirculationValue,
        activeUsers: usersRes.count ?? 0,
        lowStockItems,
        pendingQuoteDrafts, pendingQuoteSent,
        shortfallItems, nextEventDate,
        cancelledOrdersInRange, refundsOutstandingCount,
        refundsOutstandingValue, topCancelReason,
        vatCollected,
        quoteConversionRate, quoteConversionSample,
        testOrdersInRange, testRevenueInRange,
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
    // Realtime: any order change for THIS tenant refetches the current
    // range. Phase 6 audit fix: the channel was previously named
    // "admin-dashboard-orders" with no postgres_changes filter, so every
    // order INSERT/UPDATE/DELETE on every tenant globally re-triggered
    // loadMetrics() on every admin dashboard. Two problems with that:
    //   1. Massive amplification - in a multi-tenant deployment with N
    //      concurrent admin sessions, one order edit fired N re-fetches.
    //   2. Postgres_changes payloads ride the channel even when the
    //      receiving session can't read the row under RLS. Other tenants'
    //      order content was in transit across the wire.
    // Per-tenant channel name + a company_id=eq filter close both.
    const sub = supabase
      .channel(`admin-dashboard-orders:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `company_id=eq.${companyId}`,
        },
        () => loadMetrics(),
      )
      .subscribe();
    return () => { sub.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, range.from.getTime(), range.to.getTime()]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Admin dashboard - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          {/* Header + date range, date controls every metric below.
              Hero band: same command-centre treatment as the platform
              area, washed in THIS tenant's brand colours via the
              --brand-*-rgb vars (never a hard-coded palette). */}
          <PortalHeader
            variant="hero"
            title="Dashboard"
            icon={LayoutDashboard}
            subtitle={
              <>
                Live metrics for events in{" "}
                <span className="font-semibold text-white">{range.label}</span>.
                Every number below follows the selected date range.
              </>
            }
            meta={
              <>
                {!loading && !error && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {stats.activeOrders} active order{stats.activeOrders === 1 ? "" : "s"}
                  </span>
                )}
                {!loading && !error && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {stats.upcomingEvents} upcoming event{stats.upcomingEvents === 1 ? "" : "s"}
                  </span>
                )}
                {tenantTimezone && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                    <Clock className="h-3 w-3" />
                    <span className="font-mono">{effectiveTenantTimezone}</span>
                  </span>
                )}
              </>
            }
            actions={
              <>
                <DashboardDateRange range={range} onChange={setRange} anchorDate={tenantDateAnchor} />
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
              </>
            }
          />
          <PageWorkbench />

          {/* Operator safety net: if no email provider is wired up,
              every send silently fails. Show the banner directly under
              the header so it cannot be missed. Self-hides once
              email_settings is configured. */}
          {companyId ? (
            <WidgetErrorBoundary label="Email provider banner">
              <EmailProviderBanner companyId={companyId} />
            </WidgetErrorBoundary>
          ) : null}

          {/* Admin persona follow-up (admin.md section 5): promote
              the metrics-load failure to a prominent rose-tinted
              recovery card directly under the header, instead of
              the inline banner buried halfway down the page. The
              old placement at line ~730 was below year-over-year,
              widgets, and three full screens of scroll - operators
              never saw it. */}
          {error && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-rose-900 mb-1">Couldn't load dashboard metrics</h2>
              <p className="text-sm text-slate-600 mb-3">{error}</p>
              <Button onClick={loadMetrics} size="sm" className="bg-brand-primary hover:bg-brand-primary/90">
                <TrendingUp className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {/* Partial-load warning: the top-level catch above only
              fires when the orders query dies; the per-tile queries
              fail independently and used to zero their tiles in
              silence. */}
          {!error && tileWarning && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
              <div className="flex-1">
                <p className="text-sm text-amber-900">{tileWarning}</p>
              </div>
              <Button onClick={loadMetrics} size="sm" variant="outline" disabled={loading}>
                Retry
              </Button>
            </div>
          )}

          {stats.testOrdersInRange > 0 && (
            <Card className="mb-6 border border-amber-200 bg-amber-50 shadow-sm">
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
                  <div>
                    <h2 className="text-sm font-semibold text-amber-950">Automated test data found</h2>
                    <p className="mt-1 text-sm leading-5 text-amber-900">
                      This date range includes {stats.testOrdersInRange} automated E2E order{stats.testOrdersInRange === 1 ? "" : "s"} worth{" "}
                      {fmt.format(stats.testRevenueInRange)}. Owner-facing dashboard totals and charts exclude those rows so the live business figures stay clean.
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      Detected from order numbers or tags such as E2E-ORD, E2E_RUN, ORDER-E2E, and Codex E2E.
                    </p>
                  </div>
                </div>
                <Link href={testOrdersReviewHref} className="shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-amber-300 bg-white text-amber-900 hover:bg-amber-100 sm:w-auto"
                  >
                    Review test orders
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* AD-7 (admin-dashboard audit): fresh-tenant empty
              state. When the tenant has zero data across every
              dimension the page would normally show, render the
              FirstStepsCard hero at the top of the page rather
              than burying it beneath 28 self-hiding widgets.
              A new tenant (Spit Braai on day one) currently sees
              a page that reads as broken; this gives them a
              clear "here's how to start" instead.
              Detection: no orders / quotes / inventory / team
              members in the current range AND no rows. */}
          {(isFreshTenant && companyId) ? (
            <Card className="mb-6 bg-gradient-to-br from-brand-primary/10 via-brand-primary/10 to-brand-secondary/10">
              <CardHeader>
                <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
                  <LayoutDashboard className="w-6 h-6 text-brand-primary" />
                  Welcome to CateringMS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 mb-4">
                  This is your day-zero dashboard. The widgets below populate as you start using
                  the system. Take the next steps to get your tenant set up:
                </p>
                <FirstStepsCard companyId={companyId} slug={companySlug || ""} />
              </CardContent>
            </Card>
          ) : null}

          {/* Phase 9 #5: Today's pulse - live KPI strip with the
              numbers the dispatch lead actually checks every morning:
              today's confirmed events, in-transit deliveries, drivers
              on shift, kitchen prep load, money landed today. Refreshes
              every 60 seconds so the tab stays current. */}
          <WidgetErrorBoundary label="Today's pulse"><TodaysPulse companyId={companyId} timezone={effectiveTenantTimezone} /></WidgetErrorBoundary>

          {/* === KPI HEADLINES (Wave 70.53) ====================================
              Moved here from below Quick Actions. Owner brief 2026-05-22:
              "this is obviously the main section where the user can see
              how many quotes they've sent out, how many they've closed,
              how many everything." Now lives directly under Today's Pulse
              and immediately above the Cashflow Snapshot so the headline
              numbers are the second thing the operator reads on the page.

              Audit pass at the same time:
                - Booked / Collected / Outstanding maths verified against
                  live tenant data (Spit Braai 2026-05).
                - Team Members tile now filters deleted_at + is_active
                  (see loadMetrics() above).
                - Tooltip copy refreshed: the cards now sit above the
                  widget stack, so any "see the widget above" pointers
                  were rewritten.
              ================================================================ */}

          {/* Key revenue metrics, all bound to the date range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6">
            {/* Wave 70.52a - every MetricCard now carries an href so
                clicking drills to the dedicated surface for that
                number. Previously hover:shadow-lg made tiles look
                clickable while doing nothing. */}
            <MetricCard
              label="Booked Revenue"
              value={fmt.format(stats.bookedRevenue)}
              hint={`${stats.bookedOrders} confirmed booking${stats.bookedOrders === 1 ? "" : "s"}`}
              tooltip={`Total value of orders the client has confirmed for ${range.label.toLowerCase()}, either by paying a deposit or by being manually marked as confirmed by your team. Also includes orders with any payment recorded.\n\nPending, draft, and cancelled orders are excluded.`}
              icon={Banknote}
              iconColor="text-brand-primary"
              badge={{ text: `${stats.bookedOrders} booked`, tone: "green" }}
              loading={loading}
              href={withSlug("/admin/orders?status=confirmed")}
            />
            <MetricCard
              label="Collected"
              value={fmt.format(stats.collectedRevenue)}
              hint={`Money received in ${range.label}`}
              tooltip={"Money actually banked from clients in this period. Includes deposits, partial payments and fully settled invoices. If a cancelled booking still has cash on record, it stays counted here until a refund payment is recorded.\n\nPulled from recorded payments on each order."}
              icon={CheckCircle}
              iconColor="text-brand-primary"
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
              iconColor="text-slate-600"
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
                  icon={Banknote}
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
                  tooltip={"Accepted quotes divided by closed quotes (accepted + rejected + expired) whose decision landed in this date range. Drafts are excluded - they were never sent so the outcome is undecided.\n\nSample size matters. A 100% rate over 1 closed quote means much less than 60% over 30."}
                  icon={CheckCircle}
                  iconColor="text-brand-primary"
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
              tooltip={"Total value of quotes sent to clients but not yet accepted or declined. This is your live sales pipeline: the bigger this is, the more revenue is sitting one client decision away."}
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
              iconColor="text-brand-primary"
              loading={loading}
              href={withSlug("/admin/financial-dashboard")}
            />
            <MetricCard
              label="Completion Rate"
              value={`${stats.completionRate.toFixed(1)}%`}
              hint={`${stats.completedOrdersInRange} of ${stats.totalOrdersInRange} done`}
              tooltip={"Share of orders in this period that finished as completed. Note: events in the future count against the denominator until they happen, so a normal Monday may show a low number even when nothing is wrong. Anything below 95% on already-happened events is worth a closer look."}
              icon={CheckCircle}
              iconColor="text-brand-primary"
              loading={loading}
              href={withSlug("/admin/orders")}
            />
            <MetricCard
              label="Upcoming Events"
              value={stats.upcomingEvents}
              hint="Today or later, not cancelled"
              tooltip={"Events in this period that are dated today or later and have not yet been completed or cancelled. What the team is heading into next.\n\nDifferent from Active Orders: Upcoming includes pending orders; Active counts only confirmed/preparing/ready/in_transit."}
              icon={Calendar}
              iconColor="text-blue-600"
              loading={loading}
              href={withSlug("/admin/calendar")}
            />
            <MetricCard
              label="Team Members"
              value={stats.activeUsers}
              hint="Active users"
              tooltip={"Everyone currently on your team. Excludes deleted or deactivated accounts, so offboarded staff no longer inflate the headline. Not affected by the date filter."}
              icon={Users}
              iconColor="text-brand-primary"
              loading={loading}
              href={withSlug("/admin/users")}
            />
          </div>

          {/* AD-4 (admin-dashboard audit): de-duplicated. Was three
              tiles + PendingRefundsWidget + CancelledOrdersWidget = 5
              surfaces for 2 themes. Kept the single Cancellations
              tile that combines count + top reason (the lossy
              summary signal); the widgets below carry the full
              detail. Refunds tile dropped entirely - PendingRefundsWidget
              already shows count + total + row-level rows. */}
          {stats.cancelledOrdersInRange > 0 && (
            <div className="grid grid-cols-1 mb-6">
              <MetricCard
                label="Cancellations"
                value={stats.cancelledOrdersInRange}
                hint={`In ${range.label.toLowerCase()} - top reason: ${stats.topCancelReason}`}
                tooltip={`Orders that ended up cancelled in ${range.label.toLowerCase()}. The full row list is in the Cancelled Orders widget further down the page.`}
                icon={Calendar}
                iconColor="text-rose-600"
                loading={loading}
                href={withSlug("/admin/orders?status=cancelled")}
              />
            </div>
          )}
          {/* === end KPI HEADLINES =========================================== */}

          {/* AD-6: Cashflow Snapshot. The forward-looking cash
              question owners ask first ("can I make payroll Friday?")
              lives here, immediately under TodaysPulse. Role-gated;
              drills to /admin/financial-dashboard for the full chart. */}
          {canSeeFinance && companyId ? (
            <WidgetErrorBoundary label="Cashflow snapshot">
              <CashflowSnapshotWidget companyId={companyId} currency={tenantCurrency.code} />
            </WidgetErrorBoundary>
          ) : null}

          {/* Phase 17 #8: recently-viewed shortcut was here. Removed
              from the dashboard 2026-05-22 per owner brief - the strip
              was sitting between Cashflow Snapshot and the Stock
              widget, breaking the financial-then-operational reading
              flow on the main dashboard. The CommandPalette (Ctrl-K)
              already covers the same jump-back use case from any page,
              and AdminNav surfaces the last-visited orders shortcut
              when relevant. The widget component itself stays in
              src/components/admin/RecentlyViewedWidget.tsx so it can
              be re-mounted elsewhere if needed. */}

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

          {/* AD-5 (admin-dashboard audit, 2026-05-19): removed.
              CleaningQueueWidget is the cleaning lead's surface,
              not the admin's. /team-portal/cleaning/dashboard
              already shows the cleaning_jobs queue with row-level
              actions (Wave 41 Phase 2 made cleaning_jobs the
              single source of truth there). Keeping a duplicate on
              /admin/dashboard pollutes the admin view + violates
              the one-source-of-truth rule. */}

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

          {/* Wave 70.57 (owner brief 2026-05-22): MenuTopSellersWidget
              and TopClientsWidget removed from the dashboard - not
              top-of-mind signals for the owner viewing the daily
              read. Both relocated to surfaces where the question
              actually lives:
                - Top sellers -> /admin/menu (kitchen + sales lead
                  reviewing the catalogue see what's actually
                  pulling, right above the items table).
                - Top clients -> /admin/contacts (retention surface
                  in the CRM inbox - thank-yous, loyalty perks,
                  follow-up live here already, the widget belongs
                  with them).
              Imports kept on the page until I verify both new
              mount sites build cleanly. */}

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

          {/* Day-zero "First Steps" card. Self-hides once required steps
              are in or the owner dismisses / completes onboarding.
              AD-7: suppress when the fresh-tenant hero at the top of
              the page is already rendering the same card. */}
          {companyId && !isFreshTenant ? (
            <WidgetErrorBoundary label="First steps">
              <FirstStepsCard companyId={companyId} slug={companySlug || ""} />
            </WidgetErrorBoundary>
          ) : null}

          {/* First-event walkthrough. Picks up once FirstStepsCard
              gets out of the way (onboarding_completed_at set) and
              guides the owner through their first quote -> first
              event flow. Self-hides once any order exists. */}
          {companyId ? (
            <WidgetErrorBoundary label="First event walkthrough">
              <FirstEventWalkthrough companyId={companyId} slug={companySlug || ""} />
            </WidgetErrorBoundary>
          ) : null}

          {/* Priority Actions, not date-bound, always-on attention
              items. Wave 70.56 audit (Bobby brief 2026-05-22):
                - Re-ordered by actionability: shortfall first (real
                  money risk on confirmed events), then sent quotes
                  awaiting client, then drafts waiting on the admin,
                  then low stock at the floor with no demand, then
                  upcoming events.
                - Shortfall row added - the single most-actionable
                  signal on the page (consumes the same demand
                  outlook the smart low-stock widget uses).
                - Pending Quote row split into "sent / awaiting
                  client" + "drafts to finish" so the sub copy
                  reads accurately for each (sent = client's court,
                  draft = admin's court).
                - Low Stock count now matches the smart widget
                  (only counts items where a min threshold is
                  configured AND current_stock is at or below it).
                - Upcoming Events sub now reads "Next: {date}"
                  instead of the misleading "X currently active in
                  range" which conflated two different measures. */}
          {(stats.shortfallItems > 0
            || stats.pendingQuoteSent > 0
            || stats.pendingQuoteDrafts > 0
            || stats.lowStockItems > 0
            || stats.upcomingEvents > 0) && (
            <Card className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  Priority Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 sm:space-y-3">
                  {/* 1. SHORTFALL - confirmed orders in next 7 days
                       need more stock than we have. Top of the
                       list, red accent, drills to /admin/shopping
                       (the actionable surface, not /admin/inventory
                       which is the catalogue). */}
                  {stats.shortfallItems > 0 && (
                    <PriorityRow
                      icon={AlertCircle} accent="border-rose-500" iconColor="text-rose-600"
                      title={`${stats.shortfallItems} Stock Shortfall${stats.shortfallItems !== 1 ? "s" : ""}`}
                      sub="Confirmed orders in the next 7 days need more than you have on hand"
                      cta={{ href: withSlug("/admin/shopping?tab=buy_now"), label: "Shop now", variant: "default" }}
                    />
                  )}

                  {/* 2. SENT quotes awaiting the client. Amber -
                       admin can't force a reply but should chase. */}
                  {stats.pendingQuoteSent > 0 && (
                    <PriorityRow
                      icon={AlertCircle} accent="border-amber-500" iconColor="text-amber-600"
                      title={`${stats.pendingQuoteSent} Quote${stats.pendingQuoteSent !== 1 ? "s" : ""} Awaiting Client`}
                      sub="Sent and waiting for the client to accept or decline - chase the old ones"
                      cta={{ href: withSlug("/admin/quotes"), label: "Chase", variant: "default" }}
                    />
                  )}

                  {/* 3. DRAFT quotes - admin's court, finish + send. */}
                  {stats.pendingQuoteDrafts > 0 && (
                    <PriorityRow
                      icon={AlertCircle} accent="border-amber-500" iconColor="text-amber-600"
                      title={`${stats.pendingQuoteDrafts} Quote Draft${stats.pendingQuoteDrafts !== 1 ? "s" : ""}`}
                      sub="Started but not yet sent - finish and email to the client"
                      cta={{ href: withSlug("/admin/quotes"), label: "Finish", variant: "outline" }}
                    />
                  )}

                  {/* 4. LOW STOCK (at the floor, no immediate
                       demand) - operational, not urgent. Hidden
                       when shortfall already covers it. */}
                  {stats.lowStockItems > 0 && stats.shortfallItems === 0 && (
                    <PriorityRow
                      icon={Package} accent="border-orange-500" iconColor="text-orange-600"
                      title={`${stats.lowStockItems} Low Stock Item${stats.lowStockItems !== 1 ? "s" : ""}`}
                      sub="At or below the configured reorder level - top up at the usual cadence"
                      cta={{ href: withSlug("/admin/shopping?tab=buy_now"), label: "View", variant: "outline" }}
                    />
                  )}

                  {/* 5. UPCOMING EVENTS - what's coming next. Sub
                       shows the earliest date, not a conflated
                       active count. */}
                  {stats.upcomingEvents > 0 && (
                    <PriorityRow
                      icon={Calendar} accent="border-brand-primary" iconColor="text-brand-primary"
                      title={`${stats.upcomingEvents} Upcoming Event${stats.upcomingEvents !== 1 ? "s" : ""}`}
                      sub={stats.nextEventDate
                        ? `Next: ${new Date(`${stats.nextEventDate}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
                        : "On the calendar from today onwards"}
                      cta={{ href: withSlug("/admin/calendar"), label: "Calendar", variant: "outline" }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
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
                {/* AD-2 (admin-dashboard audit) + Bobby's brief:
                    "if a user needs to go shopping today, there
                    should be an easy list to print." Drills to
                    /admin/shopping where the Print today button
                    renders the buy-now list as a paper-friendly
                    table. Badge mirrors lowStockItems so the
                    urgency is visible at a glance. */}
                <Link
                  href={withSlug("/admin/shopping?tab=buy_now")}
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg hover:shadow-md transition-all"
                >
                  <div className="relative flex-shrink-0">
                    <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                    {stats.lowStockItems > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">
                        {stats.lowStockItems > 9 ? "9+" : stats.lowStockItems}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Today&apos;s Shopping</div>
                    <div className="text-xs text-slate-600">
                      {stats.lowStockItems > 0
                        ? `${stats.lowStockItems} item${stats.lowStockItems !== 1 ? "s" : ""} - print list`
                        : "Buy-now list + print"}
                    </div>
                  </div>
                </Link>
                <Link
                  href={withSlug("/admin/users")}
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-blue-50 to-brand-secondary/10 rounded-lg hover:shadow-md transition-all"
                >
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm sm:text-base text-slate-900">Team Management</div>
                    <div className="text-xs text-slate-600">{stats.activeUsers} members</div>
                  </div>
                </Link>
                {canSeeFinance ? (
                  <Link
                    href={withSlug("/admin/financial-dashboard")}
                    className="flex items-center gap-3 p-4 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 rounded-lg hover:shadow-md transition-all"
                  >
                    <Banknote className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-sm sm:text-base text-slate-900">Financial Reports</div>
                      <div className="text-xs text-slate-600">Deeper analytics</div>
                    </div>
                  </Link>
                ) : null}
                <Link
                  href={withSlug("/admin/inventory")}
                  className="flex items-center gap-3 p-4 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 rounded-lg hover:shadow-md transition-all"
                >
                  <div className="relative flex-shrink-0">
                    <Package className="w-5 h-5 sm:w-6 sm:h-6 text-brand-primary" />
                    {stats.lowStockItems > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">
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
        </PortalShell>
      </div>

      <ChatBot userRole="admin" companyId={companyId} />
    </>
  );
}

function PriorityRow({
  icon: Icon, accent, iconColor, title, sub, cta,
}: any) {
  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm sm:p-4 ${accent}`}>
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
