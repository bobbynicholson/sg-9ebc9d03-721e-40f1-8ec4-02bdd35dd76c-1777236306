/**
 * TopClientsWidget - biggest spenders over the last 30 days,
 * by total order value.
 *
 * Phase 21 #6. Retention conversations need data the owner can
 * actually act on: "who's been generous lately, who deserves a
 * thank-you, who haven't I heard from this month". The dashboard
 * had nothing aimed at the top of the funnel.
 *
 * Reads paid + completed + delivered orders in the last 30 days,
 * groups by client_name and sums total_amount. Renders the top 5
 * with their order count. Self-hides when nothing landed in the
 * window.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";

interface TopClient {
  client_name: string;
  orders: number;
  total: number;
}

export function TopClientsWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
  const [rows, setRows] = useState<TopClient[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        const { data, error } = await (supabase as any)
          .from("orders")
          .select("client_name, total_amount, status, event_date")
          .eq("company_id", companyId)
          .gte("event_date", since)
          .in("status", ["delivered", "completed", "in_transit", "ready", "preparing", "confirmed"]);
        if (error) throw error;
        const byClient = new Map<string, TopClient>();
        for (const o of (data || []) as any[]) {
          const name = (o.client_name || "").trim();
          if (!name) continue;
          const prev = byClient.get(name) || { client_name: name, orders: 0, total: 0 };
          prev.orders += 1;
          prev.total += Number(o.total_amount || 0);
          byClient.set(name, prev);
        }
        const sorted = Array.from(byClient.values())
          .filter((c) => c.total > 0)
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);
        if (!cancelled) {
          setRows(sorted);
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load top clients");
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

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="w-4 h-4 text-amber-600" />
              Top clients (last 30 days)
            </CardTitle>
            <CardDescription className="text-xs">
              Biggest spenders by booked order value. Use this for thank-yous, loyalty perks and follow-up.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/contacts")}>
            <Button variant="ghost" size="sm" className="text-amber-700">
              Contacts <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-amber-100">
            {rows.map((r, idx) => (
              // Phase 23 #6: link straight into /admin/contacts with
              // the client_name pre-filtered. The owner spotting a
              // big spender uses this for thank-you outreach.
              <li key={r.client_name}>
                <Link
                  href={withSlug(`/admin/contacts?q=${encodeURIComponent(r.client_name)}`)}
                  className="py-2 flex items-center gap-3 hover:bg-amber-50/60 rounded transition"
                >
                  <Badge className="shrink-0 text-[10px] uppercase tracking-wide font-semibold bg-amber-100 text-amber-800 border-amber-200">
                    #{idx + 1}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {r.client_name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {r.orders} order{r.orders === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-amber-800">
                    {tenantCurrency.format(r.total, 0)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
