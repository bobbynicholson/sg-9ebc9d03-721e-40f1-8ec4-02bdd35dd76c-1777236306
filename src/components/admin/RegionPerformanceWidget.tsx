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
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MapPin, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { isBookedRevenue } from "@/lib/orderRevenueClassification";
import { isReportableOrder } from "@/lib/orderRevenueMath";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysAgoDateOnly } from "@/lib/dashboardWindows";

interface RegionLite {
  id: string;
  name: string | null;
  code: string | null;
}
interface OrderLite {
  order_number?: string | null;
  event_name?: string | null;
  client_name?: string | null;
  internal_notes?: string | null;
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
        const throughIso = daysAgoDateOnly(0);
        const regionsRes = await (supabase as any)
            .from("regions")
            .select("id, name, code")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .order("name", { ascending: true });
        if (regionsRes.error) throw regionsRes.error;
        const orderRows: OrderLite[] = [];
        let offset = 0;
        while (true) {
          const { data, error } = await (supabase as any)
            .from("orders")
            .select("region_id, total_amount, status, payment_status, deposit_paid, confirmed_at, cancelled_at, order_number, event_name, client_name, internal_notes")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .gte("event_date", sinceIso)
            .lte("event_date", throughIso)
            .order("event_date", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + 999);
          if (error) throw error;
          const page = (data || []) as OrderLite[];
          orderRows.push(...page);
          if (page.length < 1000) break;
          offset += page.length;
        }
        if (cancelled) return;
        setRegions((regionsRes.data || []) as RegionLite[]);
        setOrders(orderRows);
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
      if (!isReportableOrder(o) || !isBookedRevenue(o)) continue;
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
    <Card className="mb-6 min-w-0 max-w-full overflow-hidden border-slate-200 bg-slate-50/30">
      <CardHeader className="min-w-0 px-3 py-3 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-1.5 text-sm leading-5 sm:gap-2 sm:text-base">
              <MapPin className="h-4 w-4 shrink-0 text-slate-600" />
              Branches, last 30 days
              <InfoTooltip content={"Sum of gross total_amount (including tax) and count for reportable committed orders with event dates from 30 days ago through today. Unconfirmed pipeline, cancelled and automated test orders are excluded. Orders without a matching active branch appear as Unassigned."} />
            </CardTitle>
            <CardDescription className="mt-1 text-[10px] leading-4 sm:text-xs">
              Booked-and-onwards revenue + order count per region. Sorted by revenue.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/regions")} aria-label="Manage regions" title="Manage regions" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-200 sm:h-8 sm:w-auto sm:gap-1 sm:px-2">
            <span className="sr-only sm:not-sr-only">Manage regions</span><ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-3 py-3 sm:p-5">
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="min-w-0 space-y-2">
            {entries.map((e) => {
              const share = Math.max(6, Math.round((e.revenue / topRevenue) * 100));
              return (
                <li key={e.id}>
                  <div className="mb-1 flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                    <span className="min-w-0 break-words text-xs font-medium text-slate-900 sm:flex-1 sm:text-sm">{e.label}</span>
                    <span className="inline-flex min-w-0 max-w-full items-baseline gap-x-2 text-[11px] tabular-nums text-slate-700 sm:text-xs">
                      <span className="whitespace-nowrap font-semibold">{tenantCurrency.format(e.revenue, 0)}</span>
                      <span className="whitespace-nowrap text-slate-500">{e.count} order{e.count === 1 ? "" : "s"}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${e.id === UNASSIGNED_KEY ? "bg-slate-400" : "bg-slate-500"}`}
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
