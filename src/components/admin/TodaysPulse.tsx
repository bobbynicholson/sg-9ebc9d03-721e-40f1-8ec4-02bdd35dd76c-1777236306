/**
 * TodaysPulse - compact KPI strip surfaced at the top of
 * /admin/dashboard.
 *
 * Phase 9 #5. The existing dashboard answers "how are we doing
 * this period?"; this strip answers "what's happening right now?"
 * Five tiles, one query each (cheap counts/aggregations against
 * the current day's window):
 *
 *   - Today's events:    confirmed orders with event_date == today
 *   - In transit:        today's orders with status = 'in_transit'
 *   - Drivers on shift:  driver_shifts active today (status=active
 *                         OR scheduled with the time window now)
 *   - Kitchen prep:      orders.status in (preparing, ready)
 *   - Money landed today: payments.amount_paid sum for created_at today
 *
 * Self-hides on first mount if companyId is null. Refreshes on
 * 60-second interval so the dispatch lead's tab stays current
 * without manual reload.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, ChefHat, Users, Calendar, Banknote } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { DEFAULT_TENANT_TIMEZONE, tenantToday, toLocalISO } from "@/lib/localDate";
import { shiftService } from "@/services/shiftService";
import { ALL_ACTIVE_AND_REALISED_STATUSES } from "@/lib/orderRevenueClassification";
import { useTenantHref } from "@/lib/tenantUrl";

interface PulseStats {
  todayEvents: number;
  inTransit: number;
  driversOnShift: number;
  kitchenPrep: number;
  paidToday: number;
}

const ZERO: PulseStats = {
  todayEvents: 0, inTransit: 0, driversOnShift: 0, kitchenPrep: 0, paidToday: 0,
};

export function TodaysPulse({
  companyId,
  timezone = DEFAULT_TENANT_TIMEZONE,
}: {
  companyId: string | null;
  timezone?: string | null;
}) {
  const [stats, setStats] = useState<PulseStats>(ZERO);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);
  const { withSlug } = useTenantHref();

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      const today = toLocalISO(tenantToday(timezone || DEFAULT_TENANT_TIMEZONE));
      try {
        const [todayCount, inTransitCount, prepCount, paymentsToday, activeDrivers] = await Promise.all([
          // Today's confirmed events. TIGHTEN I.77: use canonical
          // ALL_ACTIVE_AND_REALISED_STATUSES. Previously this missed
          // "completed", so events wrapped up by 14:00 dropped off the
          // strip silently and the dispatch lead saw "0 events" for
          // the rest of the afternoon.
          (supabase as any)
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("event_date", today)
            .in("status", ALL_ACTIVE_AND_REALISED_STATUSES as unknown as string[])
            .is("deleted_at", null),
          // In transit right now. Bound to today's event date so a stale
          // historical order stuck in_transit does not keep the dashboard
          // saying "on the road" after the dispatch queue is empty.
          (supabase as any)
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("event_date", today)
            .eq("status", "in_transit")
            .is("deleted_at", null),
          // Kitchen prep / ready
          (supabase as any)
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .in("status", ["preparing", "ready"])
            .is("deleted_at", null),
          // Payments landed today
          (supabase as any)
            .from("payments")
            .select("amount, created_at")
            .eq("company_id", companyId)
            .eq("payment_status", "completed")
            .neq("payment_type", "refund")
            .gte("created_at", `${today}T00:00:00`)
            .lte("created_at", `${today}T23:59:59`),
          // Drivers currently on shift - service handles the
          // scheduled-vs-now window check internally.
          shiftService.getActiveDriverIdsForCompany(companyId).catch(() => []),
        ]);
        if (cancelled) return;
        const paidSum = ((paymentsToday?.data || []) as any[]).reduce(
          (acc, p) => acc + Number(p.amount || 0), 0,
        );
        const inTransit = inTransitCount?.count ?? 0;
        setStats({
          // If an order is literally in transit today, it is part of
          // today's live workload even if a status-list drift or legacy
          // row shape makes the broader count miss it.
          todayEvents: Math.max(todayCount?.count ?? 0, inTransit),
          inTransit,
          driversOnShift: Array.isArray(activeDrivers) ? activeDrivers.length : 0,
          kitchenPrep: prepCount?.count ?? 0,
          paidToday: paidSum,
        });
      } catch {
        if (!cancelled) setStats(ZERO);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    // Refresh every 60s so the strip stays live without a manual reload.
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [companyId, timezone]);

  if (!companyId) return null;

  const tiles: Array<{
    label: string;
    value: string;
    icon: any;
    href?: string;
    tone: string;
  }> = [
    { label: "Today's events",   value: String(stats.todayEvents),  icon: Calendar, href: "/admin/orders", tone: "bg-blue-50 border-blue-200 text-blue-900" },
    { label: "In transit",        value: String(stats.inTransit),    icon: Truck,    href: "/admin/tracking?status=in_transit&view=list", tone: "bg-brand-primary/10 border-brand-primary/20 text-brand-primary" },
    { label: "Drivers on shift",  value: String(stats.driversOnShift), icon: Users,  href: "/admin/driver-management", tone: "bg-brand-primary/10 border-brand-primary/20 text-brand-primary" },
    { label: "Kitchen prep",      value: String(stats.kitchenPrep),  icon: ChefHat,  href: "/admin/orders?status=preparing", tone: "bg-slate-50 border-slate-200 text-slate-900" },
    { label: "Paid today",        value: tenantCurrency.format(stats.paidToday, 0), icon: Banknote, href: "/admin/invoices", tone: "bg-amber-50 border-amber-200 text-amber-900" },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
      {tiles.map((t) => {
        const Icon = t.icon;
        const content = (
          <Card className={`border ${t.tone} hover:shadow-md transition-shadow`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide opacity-80 leading-none">{t.label}</p>
                <p className="text-lg sm:text-xl font-bold tabular-nums leading-tight mt-0.5">
                  {loading ? "..." : t.value}
                </p>
              </div>
            </CardContent>
          </Card>
        );
        return t.href ? (
          <Link key={t.label} href={withSlug(t.href)} className="block">{content}</Link>
        ) : (
          <div key={t.label}>{content}</div>
        );
      })}
    </div>
  );
}
