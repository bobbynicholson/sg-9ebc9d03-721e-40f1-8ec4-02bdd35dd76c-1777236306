import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { BOOKED_ORDER_STATUSES, type EventCapacityCheck } from "@/lib/eventCapacity";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";
import { toLocalDateKey } from "@/lib/localDate";
import type { TenantCurrency } from "@/hooks/useTenantCurrency";
import type { Quote } from "@/types";

type AcceptedOrder = Pick<Database["public"]["Tables"]["orders"]["Row"],
  "id" | "order_number" | "client_name" | "event_name" | "event_time" | "guest_count" | "status" | "total_amount" | "currency">;

/** Private admin context: order details never enter the public capacity payload. */
export default function QuoteAcceptanceContext({ companyId, currency, quote, capacity, checking }: {
  companyId: string; currency: TenantCurrency; quote: Quote; capacity: EventCapacityCheck | null; checking: boolean;
}) {
  const date = toLocalDateKey(quote.event_date);
  const [snapshot, setSnapshot] = useState<{ key: string; orders: AcceptedOrder[] } | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const key = `${companyId}:${date}:${quote.id}:${refresh}`;
  useEffect(() => {
    let cancelled = false;
    setError(false); setSnapshot(null);
    if (!date || !companyId) return;
    (async () => {
      const orders: AcceptedOrder[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: readError } = await supabase.from("orders")
          .select("id, order_number, client_name, event_name, event_time, guest_count, status, total_amount, currency")
          .eq("company_id", companyId).eq("event_date", date).is("deleted_at", null)
          .in("status", [...BOOKED_ORDER_STATUSES]).order("id").range(offset, offset + 499);
        if (readError) throw readError;
        if (cancelled) return;
        orders.push(...(data || []).filter((order) => !isAutomatedTestOrder(order)));
        if (!data || data.length < 500) break;
      }
      orders.sort((a, b) => (a.event_time || "99").localeCompare(b.event_time || "99"));
      if (!cancelled) setSnapshot({ key, orders });
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [companyId, date, quote.id, key]);

  if (!date) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Set an event date before comparing this quote with accepted orders.</div>;
  const orders = snapshot?.key === key ? snapshot.orders : null;
  const unknownGuests = !orders || orders.some((order) => !Number.isFinite(Number(order.guest_count)) || Number(order.guest_count) <= 0)
    || (!!capacity && orders.length !== capacity.bookedOrders);
  const quoteGuestsKnown = Number.isFinite(Number(quote.guest_count)) && Number(quote.guest_count) > 0;
  const formatAmount = (value: number, code?: string | null) => {
    if (!Number.isFinite(value)) return "Amount unavailable";
    const resolved = code?.trim().toUpperCase() || currency.code;
    try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency: resolved, maximumFractionDigits: 0 }).format(value); }
    catch { return `${resolved} ${value.toFixed(0)}`; }
  };
  return <section className="rounded-lg border border-slate-200 bg-white p-4 text-left" aria-label="Accepted orders and conversion impact">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-sm font-semibold text-slate-900">Already committed on this date</h4><span className="text-xs font-medium text-slate-600">{new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`))}</span></div>
    <p className="mt-1 text-xs leading-relaxed text-slate-500">All company regions. Compare booked work with this quote before converting.</p>
    {checking ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />Checking the impact on capacity…</p> : capacity ? <>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs"><span className="text-slate-600">Events after conversion</span><strong className="tabular-nums text-slate-900">{capacity.projectedOrders} / {capacity.maxConcurrentEvents}</strong></div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-sm bg-slate-100" role="img" aria-label={`${capacity.bookedOrders} booked events plus this quote, ${capacity.maxConcurrentEvents} daily limit`}>
        <span className="bg-slate-400" style={{ width: `${capacity.bookedOrders / Math.max(1, capacity.maxConcurrentEvents, capacity.projectedOrders) * 100}%` }} />
        <span className={capacity.projectedOrders > capacity.maxConcurrentEvents ? "bg-rose-600" : "bg-brand-primary"} style={{ width: `${Math.max(0, capacity.projectedOrders - capacity.bookedOrders) / Math.max(1, capacity.maxConcurrentEvents, capacity.projectedOrders) * 100}%` }} />
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-slate-500"><span>Gray: booked</span><span>Color: this quote</span></div>
      <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary">Compare workload numbers</summary>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-2 text-xs tabular-nums">
        <span className="text-slate-500">Daily workload</span><span className="font-medium text-slate-600">Booked</span><span className="font-semibold text-slate-900">With this quote</span>
        <span className="text-slate-600">Events / {capacity.maxConcurrentEvents} limit</span><span>{capacity.bookedOrders}</span><strong>{capacity.projectedOrders}</strong>
        <span className="text-slate-600">Guests{capacity.maxKitchenLoadPerDay ? ` / ${capacity.maxKitchenLoadPerDay} limit` : ""}</span><span>{unknownGuests ? "Incomplete" : capacity.bookedGuests}</span><strong>{unknownGuests || !quoteGuestsKnown ? "Incomplete" : capacity.projectedKitchenLoad}</strong>
      </div>
      </details>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-700"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" /><span>{capacity.projectedOrders > capacity.maxConcurrentEvents ? `${capacity.projectedOrders - capacity.maxConcurrentEvents} events beyond the daily limit after conversion.` : `${Math.max(0, capacity.maxConcurrentEvents - capacity.projectedOrders)} event slots remain after conversion.`}{capacity.maxKitchenLoadPerDay == null ? " Daily kitchen guest capacity is not configured." : unknownGuests || !quoteGuestsKnown ? " Complete guest counts to verify kitchen capacity." : capacity.projectedKitchenLoad > capacity.maxKitchenLoadPerDay ? ` Kitchen load exceeds the limit by ${capacity.projectedKitchenLoad - capacity.maxKitchenLoadPerDay} guests.` : ` ${capacity.maxKitchenLoadPerDay - capacity.projectedKitchenLoad} kitchen guest places remain.`}</span></p>
    </> : <p role="alert" className="mt-3 text-xs leading-relaxed text-amber-900">Capacity could not be verified. Close and reopen this dialog to check again before deciding.</p>}
    {error ? <div role="alert" className="mt-4 text-xs text-amber-900">Accepted order details could not be loaded. <Button size="sm" variant="link" className="px-1" onClick={() => setRefresh((value) => value + 1)}>Retry details</Button></div> : !orders ? <p role="status" className="mt-4 text-xs text-slate-500">Loading accepted orders…</p> : <>
      <details className="mt-4 border-t border-slate-200 pt-3"><summary className="cursor-pointer text-xs font-medium text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary">View {orders.length} accepted orders & values</summary>
      <div className="mt-4 max-h-48 divide-y divide-slate-200 overflow-y-auto border-t border-slate-200 pr-1 [scrollbar-width:thin]">{orders.map((order) => <div key={order.id} className="py-3">
        <div className="flex items-start justify-between gap-3"><Link target="_blank" rel="noopener noreferrer" href={`/order/${order.id}`} className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-brand-primary underline-offset-4 hover:underline"><span className="break-words">{order.client_name || order.event_name || order.order_number}</span><ExternalLink aria-label="opens in a new tab" className="h-3 w-3 shrink-0" /></Link><span className="shrink-0 text-xs font-medium tabular-nums text-slate-800">{formatAmount(Number(order.total_amount), order.currency)}</span></div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{order.order_number} · {order.guest_count > 0 ? `${order.guest_count} guests` : "Guests to confirm"} · {order.event_time?.slice(0, 5) || "Time to confirm"} · {order.status.replace(/_/g, " ")}</p>
      </div>)}</div>
      {!orders.length && <p className="mt-3 text-xs text-slate-600">No accepted orders currently reserve capacity on this date.</p>}
      <div className="mt-3 border-t border-slate-200 pt-3"><p className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold text-slate-800">This quote · {quote.client_name || quote.quote_number}</span><strong className="tabular-nums text-slate-900">{formatAmount(Number(quote.total), quote.currency)}</strong></p><p className="mt-1 text-[11px] text-slate-500">{quoteGuestsKnown ? `${quote.guest_count} guests` : "Guests to confirm"} · Order and quote values are sales totals, not profit.</p></div>
      </details>
    </>}
    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Daily capacity is a planning check. Confirm service times, staffing, drivers and equipment before committing.</p>
  </section>;
}
