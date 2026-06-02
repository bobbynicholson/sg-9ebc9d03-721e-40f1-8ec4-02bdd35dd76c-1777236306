/**
 * RegionPerformanceWidget - compares revenue + order count across
 * the company's branches for the last 30 days.
 *
 * Phase 12 #2. Multi-branch tenants (e.g. Spit Braai with Joburg /
 * Cape Town / Pretoria) had no quick read on which branch was
 * pulling. The dashboard's headline numbers fold every region
 * together; the regions admin page lists them but doesn't compare
 * performance.
 *
 * This widget queries orders + regions in parallel, groups
 * confirmed-and-onwards orders by region_id (with an 'Unassigned'
 * bucket for orders without a region), sums total_amount and
 * counts orders per group, and renders a horizontal bar with
 * the share-of-top.
 *
 * Self-hides when the tenant has no regions (single-branch).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { isBookedRevenue } from "@/lib/orderRevenueClassification";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysAgoDateOnly } from "@/lib/dashboardWindows";

interface RegionLite {
  id: string;
  name: string | null;
  code: string | null;
}
interface OrderLite {
  region_id: string | null;
  total_amount: number | null;
  status: string | null;
  payment_status: string | null;
  deposit_paid: boolean | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
}
interface Entry {
  id: string;
  label: string;
  revenue: number;
  count: number;
}

const UNASSIGNED_KEY = "__unassigned";

export function RegionPerformanceWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [regions, setRegions] = useState<RegionLite[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const sinceIso = daysAgoDateOnly(30);
        const [regionsRes, ordersRes] = await Promise.all([
          (supabase as any)
            .from("regions")
            .select("id, name, code")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .order("name", { ascending: true }),
          // TIGHTEN I.70 (2026-06-01): fetch the extra columns so we
          // can apply isBookedRevenue in-memory. Previously this
          // widget's "status IN active" SQL filter counted a
          // 'confirmed' order with no deposit as booked, while the
          // dashboard's headline tile excluded the same order.
          // RegionPerformance and dashboard now agree.
          (supabase as any)
            .from("orders")
            .select("region_id, total_amount, status, payment_status, deposit_paid, confirmed_at, cancelled_at")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("event_date", sinceIso)
            .limit(2000),
        ]);
        if (regionsRes.error) throw regionsRes.error;
        if (ordersRes.error) throw ordersRes.error;
        if (cancelled) return;
        setRegions((regionsRes.data || []) as RegionLite[]);
        setOrders((ordersRes.data || []) as OrderLite[]);
        reportError(null);
      } catch (e: any) {
        if (!cancelled) {
          setRegions([]);
          setOrders([]);
          reportError(e?.message || "Could not load region performance");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  const entries = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    for (const r of regions) {
      map.set(r.id, { id: r.id, label: r.name || r.code || "Region", revenue: 0, count: 0 });
    }
    let unassignedRevenue = 0;
    let unassignedCount = 0;
    for (const o of orders) {
      // TIGHTEN I.70: shared classifier. Matches /admin/dashboard
      // booked revenue exactly.
      if (!isBookedRevenue(o)) continue;
      const total = Number(o.total_amount || 0);
      const rid = o.region_id;
      if (rid && map.has(rid)) {
        const e = map.get(rid)!;
        e.revenue += total;
        e.count += 1;
      } else {
        unassignedRevenue += total;
        unassignedCount += 1;
      }
    }
    const out = Array.from(map.values());
    if (unassignedCount > 0) {
      out.push({ id: UNASSIGNED_KEY, label: "Unassigned", revenue: unassignedRevenue, count: unassignedCount });
    }
    out.sort((a, b) => b.revenue - a.revenue);
    return out;
  }, [regions, orders]);

  const topRevenue = entries[0]?.revenue || 1;

  if (!companyId) return null;
  if (!loading && regions.length <= 1) return null;
  if (!loading && entries.length === 0) return null;

  return (
    <Card className="mb-6 border-purple-200 bg-purple-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-4 h-4 text-purple-600" />
              Branches, last 30 days
            </CardTitle>
            <CardDescription className="text-xs">
              Booked-and-onwards revenue + order count per region. Sorted by revenue.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/regions")}>
            <Button variant="ghost" size="sm" className="text-purple-700">
              Manage regions <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => {
              const share = Math.max(6, Math.round((e.revenue / topRevenue) * 100));
              return (
                <li key={e.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-900 truncate">{e.label}</span>
                    <span className="text-xs text-slate-700 tabular-nums shrink-0">
                      <span className="font-semibold">{tenantCurrency.format(e.revenue, 0)}</span>
                      <span className="ml-2 text-slate-500">{e.count} order{e.count === 1 ? "" : "s"}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-purple-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${e.id === UNASSIGNED_KEY ? "bg-slate-400" : "bg-purple-500"}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
