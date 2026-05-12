/**
 * OverdueInvoicesWidget -- list of invoices past due_date that
 * still haven't been paid.
 *
 * Phase 19 #8. The dashboard already has a refunds-awaiting-payout
 * widget for money going out, but there was no matching surface for
 * money waiting to come in. Bookkeepers had to open /admin/invoices
 * and filter by hand to see which clients were holding up cash.
 *
 * Self-hides when no invoices are overdue. Mirrors the
 * PendingRefundsWidget shape (age badge tone, client + invoice
 * number row, amount on the right) so the dashboard reads as one
 * consistent surface.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, ArrowRight } from "lucide-react";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  total_amount: number | null;
  status: string | null;
  due_date: string | null;
  orders: {
    order_number: string | null;
    client_name: string | null;
  } | null;
}

const daysPast = (iso: string | null): number => {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
};

export function OverdueInvoicesWidget({ companyId }: { companyId: string | null }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantCurrency = useTenantCurrency(companyId);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        // Anything with a due_date in the past that hasn't been
        // marked paid or cancelled. Oldest-due first so the widget
        // surfaces the longest-outstanding rows -- those are the
        // ones bookkeeping needs to chase first.
        const { data } = await (supabase as any)
          .from("invoices")
          .select(`
            id, invoice_number, total_amount, status, due_date,
            orders ( order_number, client_name )
          `)
          .eq("company_id", companyId)
          .not("status", "in", '("paid","cancelled")')
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(5);
        if (!cancelled) setRows((data || []) as InvoiceRow[]);
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

  return (
    <Card className="mb-6 border-rose-200 bg-rose-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="w-4 h-4 text-rose-600" />
              Overdue invoices
            </CardTitle>
            <CardDescription className="text-xs">
              Invoices past their due date that haven't been paid or cancelled. Oldest first.
            </CardDescription>
          </div>
          <Link href="/admin/invoices">
            <Button variant="ghost" size="sm" className="text-rose-700">
              All invoices <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <ul className="divide-y divide-rose-100">
            {rows.map((r) => {
              const age = daysPast(r.due_date);
              const tone = age >= 30
                ? "bg-rose-100 text-rose-800 border-rose-200"
                : age >= 14
                  ? "bg-orange-100 text-orange-800 border-orange-200"
                  : "bg-amber-100 text-amber-800 border-amber-200";
              return (
                <li key={r.id} className="py-2 flex items-center gap-3">
                  <Badge className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold ${tone}`}>
                    {age}d late
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {r.orders?.client_name || "Unknown client"}
                      {r.invoice_number && (
                        <span className="ml-2 text-[11px] font-normal text-slate-500 tabular-nums">
                          {r.invoice_number}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 capitalize">
                      Due {r.due_date || "tbc"} · {r.status || "outstanding"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-rose-800">
                    {tenantCurrency.format(Number(r.total_amount || 0), 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
