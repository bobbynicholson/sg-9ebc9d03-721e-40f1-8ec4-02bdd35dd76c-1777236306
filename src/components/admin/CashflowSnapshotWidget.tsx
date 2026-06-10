/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cashflow Snapshot Widget on /admin/dashboard.
 *
 * Owner asks "can I make payroll Friday?" - this card is the
 * one-line answer. Reads cash_on_hand (PR-A of the cost-mapping
 * plan) + projected revenue for the next 30 days + the four
 * cost categories that PR-E plumbed (food COGS, equipment hire,
 * shopping, supplier payables, fixed costs) and shows the net
 * 30-day forecast right on the dashboard.
 *
 * Drills to /admin/financial-dashboard for the full chart, the
 * day-by-day detail drawer, and the CSV export.
 *
 * Owner / company_admin / super_admin only (canAccessFinance) -
 * same Skylight finance-visibility rule as the full Cashflow
 * Forecast Card on /admin/financial-dashboard. Gating is enforced
 * at the mount site on /admin/dashboard.
 *
 * AD-6 of the admin-dashboard audit (docs/audits/
 * admin-dashboard-audit-2026-05-19.md).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLocalDate } from "@/lib/localFormat";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Banknote, ArrowRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fixedCostsService } from "@/services/fixedCostsService";
import { useTenantHref } from "@/lib/tenantUrl";
import * as currencyUtils from "@/lib/currencyUtils";
import { isPipelineRevenue } from "@/lib/orderRevenueClassification";

interface Props {
  companyId: string | null | undefined;
  currency?: string;
}

const HORIZON_DAYS = 30;

export function CashflowSnapshotWidget({ companyId, currency = "ZAR" }: Props) {
  const { withSlug } = useTenantHref();
  const fmt = currencyUtils.formatCurrency as (a: number, c: string) => string;

  const [cashOnHand, setCashOnHand] = useState<number>(0);
  const [cashUpdatedAt, setCashUpdatedAt] = useState<string | null>(null);
  const [income, setIncome] = useState<number>(0);
  const [costs, setCosts] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);
      const horizon = new Date(today);
      horizon.setDate(horizon.getDate() + HORIZON_DAYS);
      const horizonIso = horizon.toISOString().slice(0, 10);

      const [companyRes, ordersRes, hireRes, shoppingRes, payablesRes, fixedRows, orderItemsRes] = await Promise.all([
        (supabase as any)
          .from("companies")
          .select("cash_on_hand_cents, cash_on_hand_updated_at")
          .eq("id", companyId)
          .maybeSingle(),
        // Income: orders firing in 30d window. TIGHTEN I.72: pull the
        // fields isPipelineRevenue needs so we can defensively net out
        // cancelled / excluded rows in-memory (status filter alone misses
        // rows with cancelled_at set but status still mid-transition).
        // Plus the missed deleted_at guard that was leaking soft-deletes.
        (supabase as any)
          .from("orders")
          .select("total_amount, status, cancelled_at, deleted_at, payment_status, deposit_paid, confirmed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .gte("event_date", todayIso)
          .lte("event_date", horizonIso),
        // Costs: equipment hire pickups in window
        (supabase as any)
          .from("equipment_hire_orders")
          .select("total_cost")
          .eq("company_id", companyId)
          .gte("expected_pickup_date", todayIso)
          .lte("expected_pickup_date", horizonIso)
          .not("status", "in", "(completed,cancelled,returned)"),
        // Costs: shopping runs in window
        (supabase as any)
          .from("shopping_lists")
          .select("estimated_total")
          .eq("company_id", companyId)
          .gte("list_date", todayIso)
          .lte("list_date", horizonIso)
          .not("status", "in", "(completed,cancelled)"),
        // Costs: supplier payables in window
        (supabase as any)
          .from("supplier_payables")
          .select("amount_cents")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .is("deleted_at", null)
          .gte("due_date", todayIso)
          .lte("due_date", horizonIso),
        // Costs: fixed_costs occurrences in window
        fixedCostsService.list(companyId, { activeOnly: true }),
        // Costs: food COGS for orders in window. TIGHTEN I.72: same
        // deleted_at + canonical pipeline guard as the income query, so
        // the COGS side can't drift from the revenue side.
        (supabase as any)
          .from("orders")
          .select("id, status, cancelled_at, deleted_at, payment_status, deposit_paid, confirmed_at, order_items(quantity, unit_cost)")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .neq("status", "cancelled")
          .gte("event_date", todayIso)
          .lte("event_date", horizonIso),
      ]);
      if (cancelled) return;

      const company = (companyRes as any)?.data;
      if (company) {
        setCashOnHand(Number(company.cash_on_hand_cents || 0) / 100);
        setCashUpdatedAt(company.cash_on_hand_updated_at || null);
      }

      // Sum income. TIGHTEN I.72: defensive isPipelineRevenue filter -
      // the SQL .neq("status","cancelled") catches the common case but
      // misses rows in weird in-between states (cancelled_at stamped but
      // status not yet committed by a still-running cascade). The
      // canonical helper is the single source of truth across the
      // platform now.
      let incomeTotal = 0;
      for (const o of (ordersRes as any)?.data || []) {
        if (!isPipelineRevenue(o as any)) continue;
        incomeTotal += Number(o.total_amount) || 0;
      }

      // Sum costs
      let costsTotal = 0;
      for (const r of (hireRes as any)?.data || []) costsTotal += Number(r.total_cost) || 0;
      for (const r of (shoppingRes as any)?.data || []) costsTotal += Number(r.estimated_total) || 0;
      for (const r of (payablesRes as any)?.data || []) costsTotal += Number(r.amount_cents) / 100;
      const fixedOccurrences = fixedCostsService.expandOccurrences((fixedRows as any[]) || [], HORIZON_DAYS);
      for (const o of fixedOccurrences) costsTotal += o.amount_cents / 100;
      for (const ord of (orderItemsRes as any)?.data || []) {
        // TIGHTEN I.72: same pipeline guard on the COGS side so a
        // mid-cancellation order doesn't pay food cost on the forecast.
        if (!isPipelineRevenue(ord as any)) continue;
        for (const oi of (ord.order_items as any[]) || []) {
          const qty = Number(oi.quantity) || 0;
          const cost = Number(oi.unit_cost) || 0;
          if (qty > 0 && cost > 0) costsTotal += qty * cost;
        }
      }

      setIncome(incomeTotal);
      setCosts(costsTotal);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [companyId]);

  const forecast = cashOnHand + income - costs;
  const isPositive = forecast > 0;
  const isTight = forecast >= 0 && forecast < Math.max(costs * 0.15, 10000);
  const tone = isPositive
    ? (isTight ? "text-amber-700" : "text-emerald-700")
    : "text-red-700";

  const updatedAgeHours = cashUpdatedAt
    ? (Date.now() - new Date(cashUpdatedAt).getTime()) / (60 * 60 * 1000)
    : Infinity;
  const isStale = updatedAgeHours > 24;
  const neverSet = cashUpdatedAt === null;

  if (loading) {
    return (
      <Card className="border-2 border-emerald-200 mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
            <Banknote className="w-4 h-4 text-emerald-600" />
            Cashflow snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-12 bg-slate-100 rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-emerald-200 hover:shadow-lg transition-shadow mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
            <Banknote className="w-4 h-4 text-emerald-600" />
            Cashflow snapshot
            <InfoTooltip content={"30-day forward cashflow read: cash on hand + income still to come (booked orders) - costs still to come (food COGS, equipment hire, shopping, supplier payables, fixed costs).\n\nTap 'Open forecast' for the day-by-day chart + detail drawer + CSV export."} />
          </CardTitle>
          <Link
            href={withSlug("/admin/financial-dashboard")}
            className="text-xs text-emerald-700 hover:underline flex items-center gap-1"
          >
            Open forecast
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-slate-500">Cash on hand</div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {fmt(cashOnHand, currency)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              {neverSet ? (
                <Link href={withSlug("/admin/financial-dashboard")} className="text-amber-700 hover:underline">
                  Set today&apos;s balance
                </Link>
              ) : isStale ? (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-200 gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Update from bank
                </Badge>
              ) : (
                <span className="text-slate-500">Updated {formatRelativeTime(cashUpdatedAt!)}</span>
              )}
            </div>
          </div>
          <div className="sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">30-day forecast</div>
            <div className={`text-2xl font-bold tabular-nums ${tone}`}>
              {fmt(forecast, currency)}
            </div>
            <div className="mt-1 text-xs text-slate-500 space-y-0.5">
              <div className="flex justify-between">
                <span>In</span>
                <span className="text-emerald-700 tabular-nums">+{fmt(income, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Out</span>
                <span className="text-red-700 tabular-nums">-{fmt(costs, currency)}</span>
              </div>
            </div>
          </div>
          <div className="sm:border-l sm:border-slate-100 sm:pl-4 flex flex-col justify-center">
            {!isPositive ? (
              <div className="text-xs text-red-700 leading-relaxed">
                <AlertTriangle className="w-4 h-4 inline-block mr-1 mb-0.5" />
                Forecast is negative. Either chase outstanding invoices or push a payable. Open the full forecast for the day-by-day breakdown.
              </div>
            ) : isTight ? (
              <div className="text-xs text-amber-700 leading-relaxed">
                Tight. Forecast is positive but close to the cost-out figure. Worth eyeballing the chart.
              </div>
            ) : (
              <div className="text-xs text-emerald-700 leading-relaxed">
                Healthy. Forecast covers costs comfortably for the next 30 days.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatLocalDate(iso);
}
