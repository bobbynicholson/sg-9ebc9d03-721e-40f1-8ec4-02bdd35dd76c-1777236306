/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: finance section - rand values, totals, deposits, payments,
 * invoice link. Only rendered when canSeeOrderFinance(role) is true
 * (any ADMIN_ROLES role: super_admin / owner / company_admin /
 * region_admin / sales_admin / admin). Operational staff + magic-link
 * client mode never mount this component, so the network response
 * never carries the money fields.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Wallet, Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { SectionSkeleton } from "./SectionSkeleton";
import { getOrderPaymentSummary } from "@/lib/paymentStatus";
import { Button } from "@/components/ui/button";
import { InvoiceSendDialog, type InvoiceSendDialogInvoice } from "@/components/billing/InvoiceSendDialog";
import { ensureInvoiceForOrder } from "@/services/invoiceGenerationService";
import { useToast } from "@/hooks/use-toast";

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
  client_email?: string | null;
}

interface Payment {
  id: string;
  amount: number | null;
  payment_method: string | null;
  gateway_provider?: string | null;
  payment_status: string | null;
  payment_date: string | null;
  processed_at?: string | null;
  created_at?: string | null;
  payment_reference: string | null;
  payment_type: string | null;
}

const fmtZAR = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

export function FinanceSection({ orderId, companyId, defaultOpen, forceOpen, highlight }: Props) {
  const [money, setMoney] = useState<OrderMoney | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoice, setInvoice] = useState<InvoiceSendDialogInvoice | null>(null);
  const [sendRequestOpen, setSendRequestOpen] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: oData } = await (supabase as any)
          .from("orders")
          .select("subtotal, tax_amount, total_amount, deposit_amount, amount_paid, payment_status, balance_amount, balance_paid, deposit_paid, client_email")
          .eq("id", orderId)
          .maybeSingle();
        if (!cancelled) setMoney(oData as OrderMoney);

        const { data: pData } = await (supabase as any)
          .from("payments")
          .select("id, amount, payment_method, gateway_provider, payment_status, payment_date, processed_at, created_at, payment_reference, payment_type")
          .eq("order_id", orderId)
          .order("payment_date", { ascending: false });

        const { data: invoiceData } = await (supabase as any)
          .from("invoices")
          .select("id, invoice_number, invoice_data, amount_paid, balance_due, total_amount, status")
          .eq("order_id", orderId)
          .is("deleted_at", null)
          .in("status", ["draft", "sent", "overdue", "partially_paid", "paid"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data: invoicePayments } = invoiceData?.id
          ? await (supabase as any)
              .from("payments")
              .select("id, amount, payment_method, gateway_provider, payment_status, payment_date, processed_at, created_at, payment_reference, payment_type")
              .eq("invoice_id", invoiceData.id)
              .order("processed_at", { ascending: false })
          : { data: [] };
        const combinedPayments = Array.from(new Map(
          [...(pData || []), ...(invoicePayments || [])].map((p: any) => [p.id, p]),
        ).values()) as Payment[];
        if (!cancelled) setPayments(combinedPayments);
        if (!cancelled && invoiceData) {
          setInvoice({
            ...invoiceData,
            invoice_data: {
              ...(invoiceData.invoice_data || {}),
              clientEmail: invoiceData.invoice_data?.clientEmail || oData?.client_email || "",
              initialPaymentAmount: oData?.deposit_amount ?? invoiceData.invoice_data?.initialPaymentAmount ?? null,
            },
          } as InvoiceSendDialogInvoice);
        }
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
          .select("subtotal, tax_amount, total_amount, deposit_amount, amount_paid, payment_status, balance_amount, balance_paid, deposit_paid, client_email")
          .eq("id", orderId)
          .maybeSingle(),
        (supabase as any)
          .from("payments")
          .select("id, amount, payment_method, gateway_provider, payment_status, payment_date, processed_at, created_at, payment_reference, payment_type")
          .eq("order_id", orderId)
          .order("payment_date", { ascending: false }),
      ]);
      if (oData) setMoney(oData as OrderMoney);
      const { data: invoiceData } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, invoice_data, amount_paid, balance_due, total_amount, status")
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .in("status", ["draft", "sent", "overdue", "partially_paid", "paid"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: invoicePayments } = invoiceData?.id
        ? await (supabase as any)
            .from("payments")
            .select("id, amount, payment_method, gateway_provider, payment_status, payment_date, processed_at, created_at, payment_reference, payment_type")
            .eq("invoice_id", invoiceData.id)
            .order("processed_at", { ascending: false })
        : { data: [] };
      const combinedPayments = Array.from(new Map(
        [...(pData || []), ...(invoicePayments || [])].map((p: any) => [p.id, p]),
      ).values()) as Payment[];
      setPayments(combinedPayments);
      if (invoiceData) {
        setInvoice({
          ...invoiceData,
          invoice_data: {
            ...(invoiceData.invoice_data || {}),
            clientEmail: invoiceData.invoice_data?.clientEmail || oData?.client_email || "",
            initialPaymentAmount: oData?.deposit_amount ?? invoiceData.invoice_data?.initialPaymentAmount ?? null,
          },
        } as InvoiceSendDialogInvoice);
      }
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
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "invoices", filter: `order_id=eq.${orderId}` },
        () => { void refetch(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const total = Number(money?.total_amount ?? 0);
  const payment = getOrderPaymentSummary({
    totalAmount: money?.total_amount,
    amountPaid: money?.amount_paid,
    balanceAmount: money?.balance_amount,
    depositAmount: money?.deposit_amount,
    depositPaid: money?.deposit_paid,
    paymentStatus: money?.payment_status,
  });
  const paid = payment.amountPaid;
  const outstanding = payment.balanceDue;
  const paymentStatus = payment.label;
  const summary = loading
    ? "Loading..."
    : `${fmtZAR.format(total)} total · ${fmtZAR.format(paid)} paid · ${paymentStatus}`;

  const openPaymentRequest = async () => {
    if (outstanding <= 0) return;
    if (invoice) {
      setSendRequestOpen(true);
      return;
    }
    setCreatingRequest(true);
    try {
      const result = await ensureInvoiceForOrder(
        orderId,
        companyId,
        supabase as any,
        { origin: typeof window !== "undefined" ? window.location.origin : undefined },
      );
      if (!result.success || !result.invoiceId) {
        throw new Error(result.error || "Could not create the payment request.");
      }
      const { data: createdInvoice, error } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, invoice_data, amount_paid, balance_due, total_amount, status, sent_at")
        .eq("id", result.invoiceId)
        .maybeSingle();
      if (error || !createdInvoice) throw new Error(error?.message || "Invoice was created but could not be loaded.");
      const nextInvoice = {
        ...createdInvoice,
        invoice_data: {
          ...(createdInvoice.invoice_data || {}),
          clientEmail: createdInvoice.invoice_data?.clientEmail || money?.client_email || "",
          initialPaymentAmount: money?.deposit_amount ?? createdInvoice.invoice_data?.initialPaymentAmount ?? null,
        },
      } as InvoiceSendDialogInvoice;
      setInvoice(nextInvoice);
      if (createdInvoice.sent_at) {
        toast({ title: "Payment request sent", description: "The client received the current invoice and payment link." });
      } else {
        setSendRequestOpen(true);
        toast({ title: "Payment request ready", description: "Review the email and send it to the client." });
      }
    } catch (error: any) {
      toast({ title: "Payment request failed", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setCreatingRequest(false);
    }
  };

  return (
    <>
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
            <div className="rounded-md border p-3 bg-brand-primary/10 border-brand-primary/20">
              <p className="text-xs text-brand-primary uppercase tracking-wider">Total</p>
              <p className="text-sm font-bold text-brand-primary tabular-nums mt-0.5">{fmtZAR.format(total)}</p>
            </div>
            <div className={`rounded-md border p-3 ${outstanding > 0 ? "bg-amber-50 border-amber-200" : "bg-brand-primary/10 border-brand-primary/20"}`}>
              <p className={`text-xs uppercase tracking-wider ${outstanding > 0 ? "text-amber-800" : "text-brand-primary"}`}>
                {outstanding > 0 ? "Outstanding" : payment.label}
              </p>
              <p className={`text-sm font-bold tabular-nums mt-0.5 ${outstanding > 0 ? "text-amber-900" : "text-brand-primary"}`}>
                {fmtZAR.format(outstanding)}
              </p>
            </div>
          </div>

          {money?.deposit_amount != null && Number(money.deposit_amount) > 0 && (
            <div className="text-xs text-slate-600 inline-flex items-center gap-1.5">
              {money.deposit_paid || paid >= Number(money.deposit_amount) ? (
                <><CheckCircle2 className="w-3 h-3 text-brand-primary" />Deposit ({fmtZAR.format(Number(money.deposit_amount))}) received</>
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
                        {p.payment_method || p.gateway_provider || "-"}
                        {(p.payment_date || p.processed_at || p.created_at) && <span> · {new Date(p.payment_date || p.processed_at || p.created_at!).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>}
                        {p.payment_reference && <span> · ref {p.payment_reference}</span>}
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider ${p.payment_status === "completed" || p.payment_status === "received" ? "text-brand-primary" : "text-slate-500"}`}>
                      {p.payment_status || "-"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {outstanding > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Request the remaining payment</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  The client will see what they have paid, the remaining balance, and the current payment link.
                </p>
              </div>
              <Button type="button" size="sm" onClick={openPaymentRequest} disabled={creatingRequest} className="bg-brand-primary hover:opacity-90">
                {creatingRequest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                {creatingRequest ? "Preparing…" : invoice ? "Send payment request" : "Create payment request"}
              </Button>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
      <InvoiceSendDialog
        open={sendRequestOpen}
        onOpenChange={setSendRequestOpen}
        companyId={companyId}
        invoice={invoice}
        onSent={() => {
          toast({ title: "Payment request sent", description: "The client received the latest paid and remaining amounts." });
        }}
      />
    </>
  );
}
