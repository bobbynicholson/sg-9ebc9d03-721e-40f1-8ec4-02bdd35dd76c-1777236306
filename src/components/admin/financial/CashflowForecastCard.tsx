/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Banknote, Pencil, Save, X, AlertTriangle, ArrowUpRight, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as currencyUtils from "@/lib/currencyUtils";
import { useTenantHref } from "@/lib/tenantUrl";
import type { Order } from "@/types";

interface Props {
  companyId: string;
  /** ISO timestamp the page last refreshed - lets us tag stale-data warnings. */
  loadedAt: number;
  /** Orders array from the page's loadFinancialData. Drives the per-day projection. */
  orders: Order[];
  /** Wages still owed to staff (paymentLedgerService.totalOwed). */
  staffPaymentsOwed: number;
  /** Currency code from the company (ZAR / USD / GBP / EUR). */
  currency: string;
  /** Auth user id for the audit_log row + cash_on_hand_updated_by. */
  userId: string | null;
  /** When set, expand the card by default - lets the parent decide. */
  defaultOpen?: boolean;
}

const HORIZON_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

/**
 * Cashflow Forecast Card (post-audit feature scoped on /admin/platform/
 * running-todo). Two numbers side by side: (a) owner-typed cash on hand
 * from the bank balance, (b) projected net = cash_on_hand + income still
 * to come - costs still to come over the picker-selected horizon.
 *
 * Income side reuses the financial-dashboard's existing projected-
 * revenue calculation. Costs side starts with staff wages owed; future
 * phases add supplier payables + predicted shopping + hired equipment
 * (each one a category the running-todo card scopes for follow-up
 * iterations).
 *
 * Stale-data warning fires when cash_on_hand_updated_at > 24h old -
 * the figure rapidly loses signal if the operator hasn't punched in
 * today's bank balance. Drives the daily-update habit.
 *
 * Role-gated upstream: the financial-dashboard renders this card only
 * for owner / company_admin / super_admin per the Skylight finance-
 * visibility rule.
 */
export function CashflowForecastCard({
  companyId,
  loadedAt,
  orders,
  staffPaymentsOwed,
  currency,
  userId,
}: Props) {
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [cashOnHand, setCashOnHand] = useState<number>(0);
  const [cashUpdatedAt, setCashUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Phase 3: owner-typed contingency the forecast subtracts from the
  // closing balance. Captures "stuff that's not on the books yet but
  // I know I'll spend" (last-minute shopping, fuel, an emergency
  // rental). Persisted to localStorage per-company so it survives
  // reload without needing a new DB column.
  const [probableSpend, setProbableSpend] = useState<number>(0);
  // Phase 3: detail drawer state. Tapping a chart day opens the
  // sheet with the day's full order list (the hover tooltip only
  // shows top 4).
  const [drillDay, setDrillDay] = useState<number | null>(null);

  // Phase 4: per-category cost data. Loaded once per page refresh
  // alongside cash_on_hand. equipment_hire_orders + shopping_lists
  // are the two cost categories with concrete due-dates in the live
  // schema. Supplier-payables is deferred until a real payables
  // table lands (today's suppliers row only carries payment_terms +
  // payment_method, not an outstanding-balance ledger).
  interface ScheduledCost {
    id: string;
    label: string;
    amount: number;
    date: string;
    category: "equipment_hire" | "shopping";
  }
  const [scheduledCosts, setScheduledCosts] = useState<ScheduledCost[]>([]);

  // Phase 3: load + persist the probable-spend override under a
  // per-company localStorage key. Survives reload, lives client-side
  // only (it's a personal scratchpad number, not something the team
  // needs to share or audit).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`cateringms.cashflow.probableSpend.${companyId}`);
      if (raw) setProbableSpend(Number(raw) || 0);
    } catch { /* storage blocked */ }
  }, [companyId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        `cateringms.cashflow.probableSpend.${companyId}`,
        String(probableSpend),
      );
    } catch { /* storage blocked */ }
  }, [companyId, probableSpend]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Pull cash_on_hand + the two scheduled-cost feeds in parallel.
      const [companyRes, hireRes, shoppingRes] = await Promise.all([
        (supabase as any)
          .from("companies")
          .select("cash_on_hand_cents, cash_on_hand_updated_at")
          .eq("id", companyId)
          .single(),
        // equipment_hire_orders: pending pickups in the next 120
        // days (longest forecast horizon). Treat total_cost as due
        // on expected_pickup_date - that's when the supplier
        // typically invoices.
        (supabase as any)
          .from("equipment_hire_orders")
          .select("id, equipment_name, total_cost, expected_pickup_date, status")
          .eq("company_id", companyId)
          .not("expected_pickup_date", "is", null)
          .gte("expected_pickup_date", new Date().toISOString().slice(0, 10))
          .not("status", "in", "(completed,cancelled,returned)"),
        // shopping_lists: open lists (not completed/cancelled) with
        // a list_date in the future. estimated_total is the
        // committed cash-out figure; actual_total only populates
        // post-purchase.
        (supabase as any)
          .from("shopping_lists")
          .select("id, title, estimated_total, list_date, status")
          .eq("company_id", companyId)
          .not("list_date", "is", null)
          .gte("list_date", new Date().toISOString().slice(0, 10))
          .not("status", "in", "(completed,cancelled)"),
      ]);
      if (cancelled) return;

      const error = (companyRes as any).error;
      const data = (companyRes as any).data;
      if (error) {
        console.error("[CashflowForecastCard] load failed:", error);
      } else if (data) {
        const value = Number((data as any).cash_on_hand_cents || 0) / 100;
        setCashOnHand(value);
        setCashUpdatedAt((data as any).cash_on_hand_updated_at || null);
      }

      // Build the unified scheduled-cost list.
      const costs: ScheduledCost[] = [];
      for (const r of (hireRes as any)?.data || []) {
        const amount = Number(r.total_cost) || 0;
        if (amount <= 0 || !r.expected_pickup_date) continue;
        costs.push({
          id: `hire-${r.id}`,
          label: r.equipment_name || "Equipment hire",
          amount,
          date: r.expected_pickup_date,
          category: "equipment_hire",
        });
      }
      for (const r of (shoppingRes as any)?.data || []) {
        const amount = Number(r.estimated_total) || 0;
        if (amount <= 0 || !r.list_date) continue;
        costs.push({
          id: `shop-${r.id}`,
          label: r.title || "Shopping list",
          amount,
          date: r.list_date,
          category: "shopping",
        });
      }
      setScheduledCosts(costs);

      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId, loadedAt]);

  // Per-day projection. Walk the orders array, bucket each upcoming
  // order's total_amount onto its event_date, then accumulate a
  // running balance from day 0 (cash_on_hand minus wages-owed-today)
  // forward to the horizon. Output is the data series for the chart
  // AND the bucket of per-day income that the tooltip drills into.
  //
  // Phase 2 simplification: an order's full total_amount lands on
  // its event_date. Phase 3 will split deposit + balance into their
  // separate due-dates (deposit at quote-accept; balance N days
  // before event per company settings) for sharper timing.
  const series = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const bucketsByDay: Record<number, {
      income: number;
      costsHire: number;
      costsShopping: number;
      orders: Array<{ id: string; client: string; amount: number }>;
      costs: Array<{ id: string; label: string; amount: number; category: ScheduledCost["category"] }>;
    }> = {};
    for (let d = 0; d <= horizonDays; d++) {
      bucketsByDay[d] = { income: 0, costsHire: 0, costsShopping: 0, orders: [], costs: [] };
    }

    for (const o of orders || []) {
      if (!o.event_date) continue;
      if ((o as any).status === "cancelled") continue;
      const eventDate = new Date(o.event_date);
      if (isNaN(eventDate.getTime())) continue;
      eventDate.setHours(0, 0, 0, 0);
      const dayOffset = Math.floor((eventDate.getTime() - today.getTime()) / dayMs);
      if (dayOffset < 0 || dayOffset > horizonDays) continue;
      const amount = Number(o.total_amount) || 0;
      bucketsByDay[dayOffset].income += amount;
      bucketsByDay[dayOffset].orders.push({
        id: o.id,
        client: (o as any).client_name || "Unknown client",
        amount,
      });
    }

    // Phase 4: scheduled costs - equipment hire pickups + shopping
    // run estimates - bucket onto their due dates.
    for (const c of scheduledCosts) {
      const dt = new Date(c.date);
      if (isNaN(dt.getTime())) continue;
      dt.setHours(0, 0, 0, 0);
      const dayOffset = Math.floor((dt.getTime() - today.getTime()) / dayMs);
      if (dayOffset < 0 || dayOffset > horizonDays) continue;
      if (c.category === "equipment_hire") bucketsByDay[dayOffset].costsHire += c.amount;
      if (c.category === "shopping") bucketsByDay[dayOffset].costsShopping += c.amount;
      bucketsByDay[dayOffset].costs.push({
        id: c.id, label: c.label, amount: c.amount, category: c.category,
      });
    }

    // Walk forward. Day 0 opening balance = cash_on_hand minus the
    // wages-owed liability AND minus the owner-typed probable-spend
    // contingency. Scheduled costs hit on their due dates (within
    // the day buckets above), not day 0.
    const opening = cashOnHand - staffPaymentsOwed - (probableSpend || 0);
    let running = opening;
    const out: Array<{
      day: number;
      date: string;
      label: string;
      balance: number;
      income: number;
      costsHire: number;
      costsShopping: number;
      orders: Array<{ id: string; client: string; amount: number }>;
      costs: Array<{ id: string; label: string; amount: number; category: ScheduledCost["category"] }>;
    }> = [];
    for (let d = 0; d <= horizonDays; d++) {
      const b = bucketsByDay[d];
      running += b.income - b.costsHire - b.costsShopping;
      const dt = new Date(today.getTime() + d * dayMs);
      out.push({
        day: d,
        date: dt.toISOString().slice(0, 10),
        label: d === 0 ? "Today" : `+${d}d`,
        balance: Math.round(running),
        income: b.income,
        costsHire: b.costsHire,
        costsShopping: b.costsShopping,
        orders: b.orders,
        costs: b.costs,
      });
    }
    return out;
  }, [orders, horizonDays, cashOnHand, staffPaymentsOwed, probableSpend, scheduledCosts]);

  const totalHireForWindow = useMemo(
    () => series.reduce((s, p) => s + p.costsHire, 0),
    [series],
  );
  const totalShoppingForWindow = useMemo(
    () => series.reduce((s, p) => s + p.costsShopping, 0),
    [series],
  );

  const projectedRevenueForWindow = useMemo(() => {
    return series.reduce((sum, p) => sum + p.income, 0);
  }, [series]);
  const projectedCostsForWindow = staffPaymentsOwed;

  const forecast = series.length > 0 ? series[series.length - 1].balance : cashOnHand;
  const isPositive = forecast > 0;
  const isTight = forecast >= 0 && forecast < Math.max(staffPaymentsOwed, 10000);
  const goesNegativeAt = series.find((p) => p.balance < 0)?.day;

  const updatedAgeHours = cashUpdatedAt
    ? (Date.now() - new Date(cashUpdatedAt).getTime()) / (60 * 60 * 1000)
    : Infinity;
  const isStale = updatedAgeHours > 24;

  const handleSave = async () => {
    const parsed = Number(draft.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(parsed)) {
      toast({
        title: "Invalid amount",
        description: "Enter a number, e.g. 50000.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const cents = Math.round(parsed * 100);
      const { error: updErr } = await (supabase as any)
        .from("companies")
        .update({
          cash_on_hand_cents: cents,
          cash_on_hand_updated_at: nowIso,
          cash_on_hand_updated_by: userId,
        })
        .eq("id", companyId);
      if (updErr) {
        toast({
          title: "Couldn't save",
          description: updErr.message || "Update failed",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Audit trail. Drives the future bookkeeper-export tile (see
      // running-todo card item 10).
      try {
        await (supabase as any).from("audit_logs").insert({
          action: "financial.cash_on_hand.update",
          entity_type: "company",
          entity_id: companyId,
          company_id: companyId,
          user_id: userId,
          details: {
            old_cents: Math.round(cashOnHand * 100),
            new_cents: cents,
            currency,
          },
        });
      } catch (auditErr) {
        console.warn("[CashflowForecastCard] audit log insert failed:", auditErr);
      }

      setCashOnHand(parsed);
      setCashUpdatedAt(nowIso);
      setEditing(false);
      toast({
        title: "Cash on hand updated",
        description: "Forecast refreshed.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-2 border-emerald-200 hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1">
            Cashflow Forecast
            <InfoTooltip
              content={
                "How much cash you'll have at the end of the picker-selected horizon, given:\n\n+ Cash on hand today (typed in from your bank balance)\n+ Income still to come (booked orders firing in the window)\n- Costs still to come (staff wages owed, more categories coming in later phases)\n\nUpdate the cash-on-hand figure daily from your bank app for the forecast to stay sharp."
              }
            />
          </CardTitle>
          <Banknote className="w-5 h-5 text-emerald-600" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left column: cash on hand (editable). */}
          <div className="border-r border-slate-100 md:pr-4">
            <div className="text-xs text-slate-500 mb-1">Cash on hand</div>
            {loading ? (
              <div className="text-2xl font-bold text-slate-400">...</div>
            ) : editing ? (
              <div className="space-y-2">
                <Input
                  type="number"
                  step="0.01"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="50000"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setDraft("");
                    }}
                    disabled={saving}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">
                    {(currencyUtils.formatCurrency as (a: number, c: string) => string)(cashOnHand, currency)}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      setDraft(String(cashOnHand || ""));
                      setEditing(true);
                    }}
                    title="Update cash on hand"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {cashUpdatedAt ? (
                    <>
                      <span className="text-slate-500">
                        Updated {formatRelativeTime(cashUpdatedAt)}
                      </span>
                      {isStale && (
                        <Badge
                          className="bg-amber-100 text-amber-800 border border-amber-200 gap-1"
                          variant="secondary"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Stale
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">Never set</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right column: forecast for the selected horizon. */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Forecast end of</span>
              <Select
                value={String(horizonDays)}
                onValueChange={(v) => setHorizonDays(Number(v))}
              >
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HORIZON_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={String(o.days)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className={`text-2xl font-bold tabular-nums ${
                isPositive ? (isTight ? "text-amber-700" : "text-emerald-700") : "text-red-700"
              }`}
            >
              {(currencyUtils.formatCurrency as (a: number, c: string) => string)(forecast, currency)}
            </div>
            {/* Breakdown so the forecast number isn't a black box. */}
            <div className="mt-2 space-y-0.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Income in window</span>
                <span className="tabular-nums text-green-700">
                  +{(currencyUtils.formatCurrency as (a: number, c: string) => string)(projectedRevenueForWindow, currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Wages owed</span>
                <span className="tabular-nums text-red-700">
                  -{(currencyUtils.formatCurrency as (a: number, c: string) => string)(projectedCostsForWindow, currency)}
                </span>
              </div>
              {totalHireForWindow > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Equipment hire</span>
                  <span className="tabular-nums text-red-700">
                    -{(currencyUtils.formatCurrency as (a: number, c: string) => string)(totalHireForWindow, currency)}
                  </span>
                </div>
              )}
              {totalShoppingForWindow > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Shopping</span>
                  <span className="tabular-nums text-red-700">
                    -{(currencyUtils.formatCurrency as (a: number, c: string) => string)(totalShoppingForWindow, currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1">
                  Contingency
                  <InfoTooltip
                    content={
                      "Owner-typed buffer for spend that's not on the books yet but you know you'll have - last-minute shopping, fuel, an emergency rental. Subtracted from the forecast. Saved per-user in your browser; not shared with the team."
                    }
                  />
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-slate-400 text-[10px]">-</span>
                  <Input
                    type="number"
                    step="100"
                    value={probableSpend || ""}
                    onChange={(e) => setProbableSpend(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="h-6 w-20 text-[11px] text-right tabular-nums px-1.5 py-0"
                  />
                </span>
              </div>
              {goesNegativeAt !== undefined && (
                <div className="mt-1 flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="w-3 h-3" />
                  Balance dips below R0 on +{goesNegativeAt}d
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phase 2: per-day running-balance chart. Hover any point
            to see that day's opening balance + the orders firing
            income that day. The chart's zero line is drawn dashed
            so the owner can eyeball where they go red. */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600">
              Projected balance, day-by-day
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => downloadCsv(series, currency)}
                title="Export the day-by-day forecast as a CSV for your bookkeeper"
              >
                <Download className="w-3 h-3 mr-1" />
                CSV
              </Button>
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                {series.length} days
              </span>
            </div>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={(e: any) => {
                  // Phase 3: click a point to open the per-day detail
                  // drawer with the full contributing-orders list
                  // (tooltip only shows top 4).
                  const day = e?.activePayload?.[0]?.payload?.day;
                  if (typeof day === "number") setDrillDay(day);
                }}
                style={{ cursor: "pointer" }}
              >
                <defs>
                  <linearGradient id="cashflowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) =>
                    compactCurrency(Number(v) || 0, currency)
                  }
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
                <Tooltip
                  content={(props) => (
                    <CashflowTooltip
                      {...(props as any)}
                      currency={currency}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#cashflowFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">
            Tap a day on the chart to see the full order breakdown.
          </p>
        </div>
      </CardContent>

      {/* Phase 3: detail drawer. Opens on chart click. Shows the
          day's projected balance, the income contribution, every
          order firing that day with quick-jump links to the order
          dialog. Side sheet keeps the dashboard underneath visible
          so the owner can compare the drilled day with the chart. */}
      <Sheet open={drillDay !== null} onOpenChange={(o) => !o && setDrillDay(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {drillDay !== null && (() => {
            const point = series[drillDay];
            if (!point) return null;
            const fmt = currencyUtils.formatCurrency as (a: number, c: string) => string;
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{point.label} - {point.date}</SheetTitle>
                  <SheetDescription>
                    Projected balance + everything firing on this day.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Projected balance</div>
                    <div
                      className={`text-2xl font-bold tabular-nums ${
                        point.balance < 0 ? "text-red-700" : "text-slate-900"
                      }`}
                    >
                      {fmt(point.balance, currency)}
                    </div>
                    {point.income > 0 && (
                      <div className="mt-1 text-xs text-green-700 tabular-nums">
                        +{fmt(point.income, currency)} income today
                      </div>
                    )}
                  </div>

                  {point.orders.length === 0 && point.costs.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      Nothing firing on this day.
                    </p>
                  ) : (
                    <>
                      {point.orders.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-slate-600">
                            {point.orders.length === 1
                              ? "1 order in"
                              : `${point.orders.length} orders in`}
                          </div>
                          {point.orders.map((o) => (
                            <a
                              key={o.id}
                              href={withSlug(`/admin/orders?orderId=${o.id}`)}
                              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 hover:border-emerald-300 hover:bg-emerald-50"
                            >
                              <span className="text-sm text-slate-900 truncate flex-1">
                                {o.client}
                              </span>
                              <span className="ml-3 tabular-nums text-sm text-green-700">
                                +{fmt(o.amount, currency)}
                              </span>
                              <ArrowUpRight className="w-3.5 h-3.5 ml-2 text-slate-400" />
                            </a>
                          ))}
                        </div>
                      )}
                      {point.costs.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-slate-600">
                            {point.costs.length === 1
                              ? "1 scheduled cost"
                              : `${point.costs.length} scheduled costs`}
                          </div>
                          {point.costs.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                            >
                              <span className="text-sm text-slate-900 truncate flex-1">
                                {c.label}
                                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                                  {c.category === "equipment_hire" ? "hire" : "shopping"}
                                </span>
                              </span>
                              <span className="ml-3 tabular-nums text-sm text-red-700">
                                -{fmt(c.amount, currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      day: number;
      date: string;
      label: string;
      balance: number;
      income: number;
      orders: Array<{ id: string; client: string; amount: number }>;
    };
  }>;
  currency: string;
}

function CashflowTooltip({ active, payload, currency }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const fmt = currencyUtils.formatCurrency as (a: number, c: string) => string;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg max-w-[260px]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-slate-900">{row.label}</span>
        <span className="text-[10px] text-slate-500">{row.date}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-slate-600">Balance</span>
        <span
          className={`tabular-nums font-semibold ${
            row.balance < 0 ? "text-red-700" : "text-slate-900"
          }`}
        >
          {fmt(row.balance, currency)}
        </span>
      </div>
      {row.income > 0 && (
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <span className="text-slate-600">Income in</span>
          <span className="tabular-nums text-green-700">
            +{fmt(row.income, currency)}
          </span>
        </div>
      )}
      {row.orders.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-1 space-y-0.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            {row.orders.length === 1 ? "1 order" : `${row.orders.length} orders`}
          </div>
          {row.orders.slice(0, 4).map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-slate-700 truncate">{o.client}</span>
              <span className="tabular-nums text-slate-900">
                {fmt(o.amount, currency)}
              </span>
            </div>
          ))}
          {row.orders.length > 4 && (
            <div className="text-[10px] text-slate-400">
              +{row.orders.length - 4} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 4: CSV export of the daily forecast snapshot. Two cohorts
 * of bookkeepers asked for this same morning: it lets them paste
 * the day-by-day projected balance into their working sheet
 * without having to screenshot the chart.
 *
 * Columns: date, day_offset, balance, income, costs_hire,
 * costs_shopping. No PII (no client names) so the file is safe
 * to email or share. UTF-8 BOM at the head so Excel on Windows
 * opens it without mangling currency symbols.
 */
function downloadCsv(
  series: Array<{
    date: string;
    day: number;
    balance: number;
    income: number;
    costsHire: number;
    costsShopping: number;
  }>,
  currency: string,
) {
  const header = ["date", "day_offset", "balance", "income", "costs_hire", "costs_shopping"];
  const rows = series.map((p) => [
    p.date,
    p.day,
    p.balance,
    Math.round(p.income),
    Math.round(p.costsHire),
    Math.round(p.costsShopping),
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `cashflow-forecast-${today}-${currency}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function compactCurrency(amount: number, currency: string): string {
  const symbol =
    currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "R";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${Math.round(abs / 1_000)}k`;
  return `${sign}${symbol}${Math.round(abs)}`;
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
  return new Date(iso).toLocaleDateString();
}
