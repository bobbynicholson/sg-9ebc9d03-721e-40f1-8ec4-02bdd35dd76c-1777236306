/**
 * OverdueInvoicesWidget - list of invoices past due_date that
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
import { useTenantHref } from "@/lib/tenantUrl";
import { useReportWidgetError } from "@/components/dashboard/WidgetErrorBoundary";
import { daysSince } from "@/lib/dashboardWindows";

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

const daysPast = (iso: string | null): number => daysSince(iso);

export function OverdueInvoicesWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { reportError, retryNonce } = useReportWidgetError();
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
        // surfaces the longest-outstanding rows - those are the
        // ones bookkeeping needs to chase first.
        // TIGHTEN I.81: add missing deleted_at guard. Soft-deleted
        // invoices were surfacing in the overdue widget; the historical
        // ENUM-T comment about "cancelled" status is preserved since
        // it's still relevant to the .not("status","in", ...) filter.
        const { data, error } = await (supabase as any)
          .from("invoices")
          .select(`
            id, invoice_number, total_amount, status, due_date,
            orders ( order_number, client_name )
          `)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          // The real terminal invoice states are paid, written_off and
          // voided. All three are excluded so the widget only surfaces
          // genuinely-open invoices past their due date.
          .not("status", "in", '("paid","voided","written_off")')
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(5);
        if (error) throw error;
        if (!cancelled) {
          setRows((data || []) as InvoiceRow[]);
          reportError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          reportError(e?.message || "Could not load overdue invoices");
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
          <Link href={withSlug("/admin/invoices")}>
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
              // Phase 22 #8: rows now navigate to the invoice via
              // ?invoiceId so the bookkeeper can act on the chase in
              // one click instead of digging through the list.
              return (
                <li key={r.id}>
                  <Link
                    href={withSlug(`/admin/invoices?invoiceId=${r.id}`)}
                    className="py-2 flex items-center gap-3 hover:bg-rose-50/60 rounded transition"
                  >
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
