/**
 * InvoiceAgingCard -- aging-buckets summary for outstanding invoices.
 *
 * Phase 10 #9. The /admin/invoices page already has a bulk
 * 'Send overdue reminders' button but no visible breakdown of
 * how the receivables are aging. The bookkeeper had to mentally
 * sort the table by due date to see whether the R250k
 * outstanding was 'all this week' or 'mostly 90+ days, in
 * trouble'.
 *
 * Renders four buckets keyed off (today - due_date):
 *   - Current  (not yet due, due_date >= today)
 *   - 1 to 30  (1-30 days overdue)
 *   - 31 to 60
 *   - 61 to 90
 *   - 90+
 *
 * Each tile shows total outstanding (balance_due sum) in tenant
 * currency + invoice count. Self-hides if there are no
 * outstanding invoices.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

interface InvoiceLite {
  status: string | null;
  due_date: string | null;
  balance_due: number | null;
  total_amount: number | null;
  amount_paid: number | null;
}

const TONES = [
  { label: "Current",  tone: "bg-emerald-50 border-emerald-200 text-emerald-900" },
  { label: "1-30",     tone: "bg-blue-50 border-blue-200 text-blue-900" },
  { label: "31-60",    tone: "bg-amber-50 border-amber-200 text-amber-900" },
  { label: "61-90",    tone: "bg-orange-50 border-orange-200 text-orange-900" },
  { label: "90+",      tone: "bg-rose-50 border-rose-200 text-rose-900" },
];

export function InvoiceAgingCard({
  invoices,
  companyId,
}: {
  invoices: InvoiceLite[];
  companyId: string | null;
}) {
  const tenantCurrency = useTenantCurrency(companyId);

  const buckets = useMemo(() => {
    const out = [0, 0, 0, 0, 0]; // outstanding totals
    const counts = [0, 0, 0, 0, 0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const inv of invoices) {
      // Only outstanding invoices count -- skip paid + cancelled +
      // anything with a zero balance.
      const status = (inv.status || "").toLowerCase();
      if (status === "paid" || status === "cancelled" || status === "void" || status === "written_off") continue;
      const balance = inv.balance_due != null
        ? Number(inv.balance_due)
        : Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);
      if (balance <= 0) continue;
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const days = due ? Math.floor((today.getTime() - due.getTime()) / 86_400_000) : 0;
      let bucket = 0;
      if (days <= 0) bucket = 0;
      else if (days <= 30) bucket = 1;
      else if (days <= 60) bucket = 2;
      else if (days <= 90) bucket = 3;
      else bucket = 4;
      out[bucket] += balance;
      counts[bucket] += 1;
    }
    return { out, counts, total: out.reduce((a, b) => a + b, 0) };
  }, [invoices]);

  if (buckets.total <= 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">Outstanding by age</h3>
        <span className="text-xs text-slate-500 tabular-nums">
          {tenantCurrency.format(buckets.total, 0)} across {buckets.counts.reduce((a, b) => a + b, 0)} invoice{buckets.counts.reduce((a, b) => a + b, 0) === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        {TONES.map((t, i) => (
          <Card key={t.label} className={`border ${t.tone}`}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wide opacity-80 leading-none">{t.label}{i > 0 ? " days" : ""}</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums leading-tight mt-1">
                {tenantCurrency.format(buckets.out[i], 0)}
              </p>
              <p className="text-[11px] opacity-70 tabular-nums">
                {buckets.counts[i]} invoice{buckets.counts[i] === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
