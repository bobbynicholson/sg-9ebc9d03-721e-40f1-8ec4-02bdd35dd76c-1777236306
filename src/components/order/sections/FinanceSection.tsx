/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: finance section - rand values, totals, deposits, payments,
 * invoice link. Only rendered when canSeeOtherStaffPay(role) is true
 * (super_admin / owner / company_admin). Staff roles + magic-link
 * client mode never mount this component, so the network response
 * never carries the money fields.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Wallet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { SectionSkeleton } from "./SectionSkeleton";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface OrderMoney {
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  deposit_amount: number | null;
  amount_paid: number | null;
  payment_status: string | null;
  balance_amount: number | null;
  balance_paid: boolean | null;
  deposit_paid: boolean | null;
}

interface Payment {
  id: string;
  amount: number | null;
  payment_method: string | null;
  payment_status: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  payment_type: string | null;
}

const fmtZAR = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

export function FinanceSection({ orderId, companyId, defaultOpen, forceOpen, highlight }: Props) {
  const [money, setMoney] = useState<OrderMoney | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: oData } = await (supabase as any)
          .from("orders")
          .select("subtotal, tax_amount, total_amount, deposit_amount, amount_paid, payment_status, balance_amount, balance_paid, deposit_paid")
          .eq("id", orderId)
          .maybeSingle();
        if (!cancelled) setMoney(oData as OrderMoney);

        const { data: pData } = await (supabase as any)
          .from("payments")
          .select("id, amount, payment_method, payment_status, payment_date, payment_reference, payment_type")
          .eq("order_id", orderId)
          .order("payment_date", { ascending: false });
        if (!cancelled) setPayments((pData || []) as Payment[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadFinanceSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  // ODOC: realtime sub scoped to this order. When a deposit/balance/refund
  // lands (payments) OR the order totals move (e.g. a billed equipment damage
  // folds a charge into total/balance) the figures should flip live without a
  // manual refresh - parity with the client portal. Listens to BOTH payments
  // and the orders row so any money change reflects in real time.
  useEffect(() => {
    if (!orderId) return;
    const refetch = async () => {
      const [{ data: oData }, { data: pData }] = await Promise.all([
        (supabase as any)
          .from("orders")
          .select("subtotal, tax_amount, total_amount, deposit_amount, amount_paid, payment_status, balance_amount, balance_paid, deposit_paid")
          .eq("id", orderId)
          .maybeSingle(),
        (supabase as any)
          .from("payments")
          .select("id, amount, payment_method, payment_status, payment_date, payment_reference, payment_type")
          .eq("order_id", orderId)
          .order("payment_date", { ascending: false }),
      ]);
      if (oData) setMoney(oData as OrderMoney);
      setPayments((pData || []) as Payment[]);
    };
    const ch = supabase
      .channel(`order-doc-finance:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `order_id=eq.${orderId}` },
        () => { void refetch(); },
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => { void refetch(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const total = Number(money?.total_amount ?? 0);
  const paid = Number(money?.amount_paid ?? 0);
  // Prefer the persisted balance_amount column if filled - it
  // already accounts for refunds + adjustments. Fall back to a
  // straight total - paid calc when the column hasn't been
  // backfilled on legacy rows.
  const outstanding = money?.balance_amount != null
    ? Math.max(0, Number(money.balance_amount))
    : Math.max(0, total - paid);
  const paymentStatus = money?.payment_status?.toLowerCase() || "pending";
  const summary = loading
    ? "Loading..."
    : `${fmtZAR.format(total)} total · ${fmtZAR.format(paid)} paid · ${paymentStatus}`;

  return (
    <CollapsibleSection
      id="section-admin"
      title="Finance"
      summary={summary}
      icon={Wallet}
      accent="emerald"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      {loading ? (
        <SectionSkeleton rows={4} variant="tiles" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Subtotal</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">{fmtZAR.format(Number(money?.subtotal || 0))}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">VAT</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">{fmtZAR.format(Number(money?.tax_amount || 0))}</p>
            </div>
            <div className="rounded-md border p-3 bg-emerald-50 border-emerald-200">
              <p className="text-xs text-emerald-800 uppercase tracking-wider">Total</p>
              <p className="text-sm font-bold text-emerald-900 tabular-nums mt-0.5">{fmtZAR.format(total)}</p>
            </div>
            <div className={`rounded-md border p-3 ${outstanding > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              <p className={`text-xs uppercase tracking-wider ${outstanding > 0 ? "text-amber-800" : "text-emerald-800"}`}>
                {outstanding > 0 ? "Outstanding" : "Paid in full"}
              </p>
              <p className={`text-sm font-bold tabular-nums mt-0.5 ${outstanding > 0 ? "text-amber-900" : "text-emerald-900"}`}>
                {fmtZAR.format(outstanding)}
              </p>
            </div>
          </div>

          {money?.deposit_amount != null && Number(money.deposit_amount) > 0 && (
            <div className="text-xs text-slate-600 inline-flex items-center gap-1.5">
              {money.deposit_paid || paid >= Number(money.deposit_amount) ? (
                <><CheckCircle2 className="w-3 h-3 text-emerald-600" />Deposit ({fmtZAR.format(Number(money.deposit_amount))}) received</>
              ) : (
                <><AlertCircle className="w-3 h-3 text-amber-600" />Deposit due: {fmtZAR.format(Number(money.deposit_amount))}</>
              )}
            </div>
          )}

          {payments.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Payments</p>
              <ul className="divide-y divide-slate-100 border rounded-md">
                {payments.map((p) => (
                  <li key={p.id} className="p-2.5 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 tabular-nums">
                        {fmtZAR.format(Number(p.amount || 0))}
                        {p.payment_type && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500 font-normal">{p.payment_type}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.payment_method || "-"}
                        {p.payment_date && <span> · {new Date(p.payment_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>}
                        {p.payment_reference && <span> · ref {p.payment_reference}</span>}
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider ${p.payment_status === "completed" || p.payment_status === "received" ? "text-emerald-700" : "text-slate-500"}`}>
                      {p.payment_status || "-"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
