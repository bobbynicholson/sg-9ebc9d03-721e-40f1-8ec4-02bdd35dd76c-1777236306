/**
 * InvoiceAgingCard - aging-buckets summary for outstanding invoices.
 *
 * Wave 64 - bucket boundaries restructured for catering's actual
 * cashflow cycle. Pre-Wave-64 used standard B2B receivables thinking
 * (Current / 1-30 / 31-60 / 61-90 / 90+) - but catering invoices
 * don't behave like B2B credit terms. The cycle is:
 *
 *   1. Deposit on quote acceptance (often weeks before event)
 *   2. Balance due 7-14 days BEFORE the event
 *   3. Final invoice issued at or just after the event
 *
 * So a 5-day "overdue" invoice is genuinely chase-now: the event
 * has happened, the kitchen costs are sunk, the food is eaten. By
 * 30 days late it's already dispute / write-off territory. The
 * 60 + 90 buckets sat empty for every healthy catering tenant
 * forever and the rose 90+ tile glowed red in a "hostile empty
 * surveillance" pattern (per Audit 3).
 *
 * New buckets:
 *   - Pre-event   (due_date in future - normal, balance owing on
 *                  a future event)
 *   - 0-7 late    (chase immediately, this is late)
 *   - 8-30 late   (formal collection)
 *   - 30+ late    (escalate / legal)
 *
 * Plus: tiles render NEUTRAL (white border-slate) when their count
 * is zero so an empty late bucket doesn't read as a warning. Tone
 * only kicks in when the bucket has invoices in it.
 *
 * Per the Wave 64 sign-off note: ship with a one-time changelog
 * note in the page header explaining the bucket change. The
 * "Outstanding by age" header copy now references "catering days"
 * to nudge the bookkeeper that this is intentional.
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

// Tone applied ONLY when the bucket has invoices. Empty buckets
// stay neutral white so the row doesn't scream surveillance when
// the tenant is on top of receivables.
const BUCKETS = [
  { label: "Pre-event",  sub: "balance owed, event still ahead",        tone: "bg-slate-50 border-slate-200 text-slate-800" },
  { label: "0-7 late",   sub: "chase now, the event has happened",     tone: "bg-amber-50 border-amber-200 text-amber-900" },
  { label: "8-30 late",  sub: "formal collection",                     tone: "bg-orange-50 border-orange-200 text-orange-900" },
  { label: "30+ late",   sub: "escalate or write off",                 tone: "bg-rose-50 border-rose-200 text-rose-900" },
];

const NEUTRAL_TONE = "bg-white border-slate-200 text-slate-500";

export function InvoiceAgingCard({
  invoices,
  companyId,
}: {
  invoices: InvoiceLite[];
  companyId: string | null;
}) {
  const tenantCurrency = useTenantCurrency(companyId);

  const buckets = useMemo(() => {
    // Order matches BUCKETS above: Pre-event / 0-7 / 8-30 / 30+
    const out = [0, 0, 0, 0];
    const counts = [0, 0, 0, 0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const inv of invoices) {
      // Wave 64 - skip closed statuses. The exclusion set matches the
      // canonical invoice_status enum (no dead "cancelled" / "void"
      // literals from the pre-Wave-30 schema).
      const status = (inv.status || "").toLowerCase();
      if (status === "paid" || status === "written_off") continue;
      const balance = inv.balance_due != null
        ? Number(inv.balance_due)
        : Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);
      if (balance <= 0) continue;
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const days = due ? Math.floor((today.getTime() - due.getTime()) / 86_400_000) : 0;
      let bucket = 0;
      if (days <= 0) bucket = 0;       // pre-event (due in future or today)
      else if (days <= 7) bucket = 1;  // 0-7 days late
      else if (days <= 30) bucket = 2; // 8-30 days late
      else bucket = 3;                  // 30+ days late
      out[bucket] += balance;
      counts[bucket] += 1;
    }
    return { out, counts, total: out.reduce((a, b) => a + b, 0) };
  }, [invoices]);

  if (buckets.total <= 0) return null;

  const totalCount = buckets.counts.reduce((a, b) => a + b, 0);

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-1">
        <h3 className="text-sm font-semibold text-slate-700">
          Outstanding by age
          <span className="ml-1.5 text-[11px] font-normal text-slate-500" title="Buckets are catering-specific: events typically charge a deposit, with balance due 7-14 days before the event. 30+ days late = escalate.">
            (catering cycle)
          </span>
        </h3>
        <span className="text-xs text-slate-500 tabular-nums">
          {tenantCurrency.format(buckets.total, 0)} across {totalCount} invoice{totalCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {BUCKETS.map((b, i) => {
          const hasContent = buckets.counts[i] > 0;
          // Wave 64 - empty buckets stay neutral; only tinted when
          // count > 0. Pre-Wave-64 the rose 90+ bucket lit red even
          // when empty, scolding tenants with clean books.
          const tone = hasContent ? b.tone : NEUTRAL_TONE;
          return (
            <Card key={b.label} className={`border ${tone}`}>
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wide opacity-80 leading-none">{b.label}</p>
                <p className="text-lg sm:text-xl font-bold tabular-nums leading-tight mt-1">
                  {tenantCurrency.format(buckets.out[i], 0)}
                </p>
                <p className="text-[11px] opacity-70 tabular-nums">
                  {buckets.counts[i]} invoice{buckets.counts[i] === 1 ? "" : "s"}
                </p>
                {hasContent && (
                  <p className="text-[10px] opacity-60 mt-0.5 leading-tight">{b.sub}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
