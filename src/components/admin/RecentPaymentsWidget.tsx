/**
 * RecentPaymentsWidget -- last 5 payments collected for the tenant.
 *
 * Phase 16 #9. Today's Pulse (Phase 9 #5) shows 'Paid today'
 * total but no row-level detail. The bookkeeper reconciling
 * payments against the bank deposit had to dig into /admin/
 * invoices or run a SQL query to see which clients paid.
 *
 * Self-hides when no payments exist in the last 7 days.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";

interface PaymentRow {
  id: string;
  amount: number | null;
  payment_method: string | null;
  payment_status: string | null;
  payment_type: string | null;
  created_at: string | null;
  order_id: string | null;
  order: {
    order_number: string | null;
    client_name: string | null;
  } | null;
}

const fmtRelative = (iso: string | null): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export function RecentPaymentsWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const { data } = await (supabase as any)
          .from("payments")
          .select(`
            id, amount, payment_method, payment_status, payment_type, created_at, order_id,
            order:order_id ( order_number, client_name )
          `)
          .eq("company_id", companyId)
          .neq("payment_type", "refund")
          .eq("payment_status", "completed")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancelled) setRows((data || []) as PaymentRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  const total = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);

  return (
    <Card className="mb-6 border-emerald-200 bg-emerald-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Recent payments, last 7 days
            </CardTitle>
            <CardDescription className="text-xs">
              Completed payments (deposits + balances) excluding refunds. Newest first.
            </CardDescription>
          </div>
          <Link href={withSlug("/admin/invoices")}>
            <Button variant="ghost" size="sm" className="text-emerald-700">
              All invoices <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <>
            <ul className="divide-y divide-emerald-100">
              {rows.map((r) => {
                // Phase 23 #8: full-row link to the originating
                // order so the bookkeeper can verify the payment
                // in context. Falls back to a non-clickable row
                // when the payment isn't tied to an order.
                const Row = (
                  <>
                    <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                      {r.payment_type || "payment"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.order?.client_name || "Unknown client"}
                        {r.order?.order_number && (
                          <span className="ml-2 text-[11px] font-normal text-slate-500 tabular-nums">{r.order.order_number}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums capitalize">
                        {r.payment_method || "method tbc"} · {fmtRelative(r.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-800">
                      {tenantCurrency.format(Number(r.amount || 0), 0)}
                    </span>
                  </>
                );
                return (
                  <li key={r.id}>
                    {r.order_id ? (
                      <Link
                        href={withSlug(`/admin/orders?orderId=${r.order_id}`)}
                        className="py-2 flex items-center gap-3 hover:bg-emerald-50/60 rounded transition"
                      >
                        {Row}
                      </Link>
                    ) : (
                      <div className="py-2 flex items-center gap-3">{Row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 pt-2 border-t border-emerald-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{rows.length} payment{rows.length === 1 ? "" : "s"}</span>
              <span className="tabular-nums font-medium text-slate-700">
                {tenantCurrency.format(total, 0)} total
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
