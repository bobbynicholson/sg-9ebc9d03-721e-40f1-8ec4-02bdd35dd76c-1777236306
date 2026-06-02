/**
 * DispatchGapWidget - confirmed-and-onwards orders in the next
 * 7 days that don't have a driver assigned yet.
 *
 * Phase 14 #8. The dispatch lead had no quick read on which
 * upcoming events still needed a driver. They had to scan the
 * orders kanban for missing-assignment chips, easy to miss when
 * the column was busy.
 *
 * Self-hides when every upcoming order is covered.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, ArrowRight, AlertCircle } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { PRE_DISPATCH_STATUSES } from "@/lib/orderRevenueClassification";

interface OrderRow {
  id: string;
  order_number: string | null;
  client_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  status: string | null;
}

const fmtTime = (t: string | null): string => (t ? t.slice(0, 5) : "TBC");

export function DispatchGapWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const today = toLocalISO(new Date());
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 7);
        const horizonIso = toLocalISO(horizon);
        const { data, error } = await (supabase as any)
          .from("orders")
          .select("id, order_number, client_name, event_date, event_time, guest_count, status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .is("assigned_driver_id", null)
          .in("status", PRE_DISPATCH_STATUSES as unknown as string[])
          .gte("event_date", today)
          .lte("event_date", horizonIso)
          .order("event_date", { ascending: true })
          .limit(8);
        if (error) throw error;
        if (!cancelled) {
          setRows((data || []) as OrderRow[]);
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load dispatch gaps");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, retryNonce]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Card className="mb-6 border-orange-200 bg-orange-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="w-4 h-4 text-orange-600" />
              Dispatch coverage gaps
            </CardTitle>
            <CardDescription className="text-xs">
              Confirmed events in the next 7 days without a driver assigned. Soonest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/order-assignments")}>
            <Button variant="ghost" size="sm" className="text-orange-700">
              Assign drivers <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-orange-100">
            {rows.map((o) => {
              const eventDate = o.event_date ? new Date(`${o.event_date}T00:00:00`) : null;
              const days = eventDate
                ? Math.max(0, Math.floor((eventDate.getTime() - today.getTime()) / 86_400_000))
                : 0;
              const tone = days === 0 ? "bg-rose-100 text-rose-800 border-rose-200"
                : days <= 1 ? "bg-orange-100 text-orange-800 border-orange-200"
                : "bg-amber-100 text-amber-800 border-amber-200";
              const label = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days}d`;
              return (
                <li key={o.id} className="py-2 flex items-center gap-3">
                  <Badge className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold ${tone}`}>
                    {days <= 1 && <AlertCircle className="w-3 h-3" />}
                    {label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {o.client_name || "-"}
                      {o.order_number && (
                        <span className="ml-2 text-[11px] font-normal text-slate-500 tabular-nums">{o.order_number}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {o.event_date} at {fmtTime(o.event_time)}
                      {o.guest_count != null && ` · ${o.guest_count} guests`}
                    </p>
                  </div>
                  <Link href={withSlug(`/order/${o.id}?role=driver`)}>
                    <Button size="sm" variant="outline" className="shrink-0">
                      Open
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
