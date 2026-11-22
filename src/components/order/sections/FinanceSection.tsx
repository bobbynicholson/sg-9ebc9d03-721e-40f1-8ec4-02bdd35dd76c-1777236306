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
import { Wallet, Loader2, CheckCircle2, AlertCircle, Send, Banknote } from "lucide-react";
import { SectionSkeleton } from "./SectionSkeleton";
import { getOrderPaymentSummary } from "@/lib/paymentStatus";
import { Button } from "@/components/ui/button";
import { InvoiceSendDialog, type InvoiceSendDialogInvoice } from "@/components/billing/InvoiceSendDialog";
import { MarkPaidDialog, type MarkPaidDialogInvoice } from "@/components/billing/MarkPaidDialog";
import { emitOrderUpdated } from "@/lib/events/orderEvents";
import { ensureInvoiceForOrder } from "@/services/invoiceGenerationService";
import { useToast } from "@/hooks/use-toast";

interface Props {
  /** Rendered in the narrow right-hand panel on desktop. */
  inSidePanel?: boolean;
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
  // Store credit the client holds (e.g. an earlier overpayment), so the team
  // remembers to use it on this order.
  const [clientCredit, setClientCredit] = useState(0);
  useEffect(() => {
    const invoiceId = (invoice as any)?.id;
    if (!invoiceId) { setClientCredit(0); return; }
    let cancelled = false;
    fetch(`/api/admin/invoices/${invoiceId}/apply-credit`)
      .then((r) => r.json().catch(() => ({})))
      .then((j: any) => { if (!cancelled) setClientCredit(j?.ok ? Number(j.available) || 0 : 0); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [(invoice as any)?.id, (invoice as any)?.balance_due]);
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
          .select("id, client_id, invoice_number, invoice_data, amount_paid, balance_due, total_amount, status, payment_opening_paid")
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
        .select("id, client_id, invoice_number, invoice_data, amount_paid, balance_due, total_amount, status, payment_opening_paid")
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
  // Money recorded as already paid when the invoice was brought into the
  // system (imports). It is in the paid total but has no payment row, so it
  // is listed separately or the list looks short of "Paid in full".
  const openingPaid = Number((invoice as any)?.payment_opening_paid) || 0;
  const overpaidBy = Math.round((Number(money?.amount_paid ?? 0) - total) * 100) / 100;
  const paymentStatus = payment.label;
  const summary = loading
    ? "Loading..."
    : `${fmtZAR.format(total)} total · ${fmtZAR.format(paid)} paid · ${paymentStatus}`;

  // Record a payment received outside the platform (EFT, cash, card) -
  // same dialog + RPC as Admin > Invoices "Mark paid", so the payments
  // ledger, invoice and order payment status stay in step. Partial
  // amounts are fine.
  const [markPaid, setMarkPaid] = useState<MarkPaidDialogInvoice | null>(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const openRecordPayment = async () => {
    setPreparingPayment(true);
    try {
      let inv: any = invoice;
      if (!inv) {
        // Admin action: create the invoice even for an imported order.
        const result = await ensureInvoiceForOrder(orderId, companyId, supabase as any, {
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
          force: true,
        });
        if (!result.success || !result.invoiceId) throw new Error(result.error || "Could not prepare the invoice to record the payment against.");
        const { data } = await (supabase as any)
          .from("invoices")
          .select("id, client_id, invoice_number, invoice_data, amount_paid, balance_due, total_amount, status, sent_at, payment_opening_paid")
          .eq("id", result.invoiceId)
          .maybeSingle();
        if (!data) throw new Error("Invoice was created but could not be loaded.");
        inv = data;
        setInvoice(data as InvoiceSendDialogInvoice);
      }
      setMarkPaid({
        id: inv.id,
        invoice_number: inv.invoice_number ?? null,
        total_amount: Number(inv.total_amount ?? total) || 0,
        balance_due: Number(inv.balance_due ?? outstanding) || 0,
        order_id: orderId,
        client_id: (inv as any).client_id ?? null,
      });
    } catch (error: any) {
      toast({ title: "Could not record a payment", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setPreparingPayment(false);
    }
  };

  const openPaymentRequest = async () => {
    if (outstanding <= 0) return;
    if (invoice) {
      setSendRequestOpen(true);
      return;
    }
    setCreatingRequest(true);
    try {
      // force: an admin asked for this, so imported orders get their
      // invoice too (they were skipped and the button just errored).
      const result = await ensureInvoiceForOrder(
        orderId,
        companyId,
        supabase as any,
        { origin: typeof window !== "undefined" ? window.location.origin : undefined, force: true },
      );
      if (!result.success || !result.invoiceId) {
        throw new Error(result.error || (result.skipped ? `Invoice not created (${result.skipped}).` : "Could not create the payment request."));
      }
      const { data: createdInvoice, error } = await (supabase as any)
        .from("invoices")
        .select("id, client_id, invoice_number, invoice_data, amount_paid, balance_due, total_amount, status, sent_at, payment_opening_paid")
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
        <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-slate-700">Order total</h3>
                <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums tracking-tight text-slate-950">{fmtZAR.format(total)}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${outstanding > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
                {paymentStatus}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3 border-t border-slate-200 pt-3">
              <div className="min-w-0">
                <dt className="text-sm text-slate-600">Paid</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmtZAR.format(paid)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm text-slate-600">Balance due</dt>
                <dd className={`mt-0.5 font-semibold tabular-nums ${outstanding > 0 ? "text-amber-900" : "text-slate-900"}`}>{fmtZAR.format(outstanding)}</dd>
              </div>
            </dl>
          </div>

          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-medium tabular-nums text-slate-900">{fmtZAR.format(Number(money?.subtotal || 0))}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-slate-600">VAT</dt>
              <dd className="font-medium tabular-nums text-slate-900">{fmtZAR.format(Number(money?.tax_amount || 0))}</dd>
            </div>
            {money?.deposit_amount != null && Number(money.deposit_amount) > 0 && (
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-slate-200 pt-2">
                <dt className="inline-flex min-w-0 items-center gap-2 text-slate-600">
                  {money.deposit_paid || paid >= Number(money.deposit_amount) ? (
                    <><CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" /> Deposit received</>
                  ) : (
                    <><AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700" /> Deposit due</>
                  )}
                </dt>
                <dd className="font-medium tabular-nums text-slate-900">{fmtZAR.format(Number(money.deposit_amount))}</dd>
              </div>
            )}
          </dl>

          {outstanding > 0 && clientCredit > 0 && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              This client has <strong>{fmtZAR.format(clientCredit)}</strong> credit. Use it from <strong>Record payment</strong> or have the client apply it on their payment link.
            </p>
          )}

          {outstanding > 0 && (
            <div className="space-y-3 border-t border-slate-200 pt-4 print:hidden">
              <div>
                <h3 className="text-base font-semibold text-slate-950">Collect the balance</h3>
                <p className="mt-1 text-sm text-slate-600">Send the latest invoice and payment link, or record money already received.</p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2">
                <Button type="button" onClick={openPaymentRequest} disabled={creatingRequest} className="h-auto min-h-[44px] min-w-0 whitespace-normal">
                  {creatingRequest ? <Loader2 className="animate-spin" /> : <Send />}
                  {creatingRequest ? "Preparing…" : invoice ? "Send payment request" : "Create payment request"}
                </Button>
                <Button type="button" variant="outline" onClick={openRecordPayment} disabled={preparingPayment} className="h-auto min-h-[44px] min-w-0 whitespace-normal">
                  {preparingPayment ? <Loader2 className="animate-spin" /> : <Banknote />}
                  Record payment
                </Button>
              </div>
            </div>
          )}

          {overpaidBy > 0.01 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              The client has paid <strong className="tabular-nums">{fmtZAR.format(overpaidBy)}</strong> more than the total. It was recorded without saying whether it is credit or a refund, so agree with the client how to settle it.
            </p>
          )}

          {(payments.length > 0 || openingPaid > 0) && (
            <div>
              <h3 className="border-b border-slate-200 pb-2 text-base font-semibold text-slate-950">Payment history</h3>
              <ul className="divide-y divide-slate-200">
                {openingPaid > 0 && (
                  <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold tabular-nums text-slate-900">{fmtZAR.format(openingPaid)}</p>
                      <p className="mt-0.5 text-slate-600">Paid before this invoice was in the system</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Paid</span>
                  </li>
                )}
                {payments.map((entry) => {
                  const date = entry.payment_date || entry.processed_at || entry.created_at;
                  const received = entry.payment_status === "completed" || entry.payment_status === "received";
                  return (
                    <li key={entry.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 py-3 text-sm">
                      <div className="min-w-0 flex-auto">
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-semibold tabular-nums text-slate-900">{fmtZAR.format(Number(entry.amount || 0))}</span>
                          {entry.payment_type && <span className="capitalize text-slate-600">{entry.payment_type.replace(/_/g, " ")}</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-slate-600">
                          {(entry.payment_method || entry.gateway_provider) && <span className="capitalize">{(entry.payment_method || entry.gateway_provider)?.replace(/_/g, " ")}</span>}
                          {date && <time dateTime={date}>{new Date(date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</time>}
                        </p>
                        {entry.payment_reference && <p className="mt-0.5 text-slate-600">Reference: {entry.payment_reference}</p>}
                      </div>
                      {entry.payment_status && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${received ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                          {entry.payment_status.replace(/_/g, " ")}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {outstanding <= 0 && invoice && (
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-3 print:hidden">
              <p className="min-w-0 flex-[1_1_12rem] text-sm text-slate-600">Record customer overpayments as credit or a refund.</p>
              <Button type="button" variant="outline" className="h-auto min-h-[44px] max-w-full whitespace-normal" onClick={openRecordPayment} disabled={preparingPayment}>
                {preparingPayment ? <Loader2 className="animate-spin" /> : <Banknote />}
                Record extra payment
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
        onSent={async (sentInvoice) => {
          toast({ title: "Payment request sent", description: "The client received the latest paid and remaining amounts." });
          // A duplicated order's invoice starts as an unsent draft. Mark it
          // sent (same as Admin > Invoices) so reminders start; sent_at
          // stops the "sent but never emailed" retry from emailing again.
          if (String(sentInvoice.status || "") !== "draft") return;
          const { setInvoiceStatus } = await import("@/services/order/invoiceStatus");
          const statusRes = await setInvoiceStatus(sentInvoice.id, "sent", {
            client: supabase,
            reason: "Payment request sent from the order",
          });
          const { error: stampErr } = await (supabase as any)
            .from("invoices")
            .update({ sent_at: new Date().toISOString() })
            .eq("id", sentInvoice.id);
          if (!statusRes.success || stampErr) {
            toast({
              title: "Email sent, but the invoice is still marked Draft",
              description: `${statusRes.error || stampErr?.message || "Unknown error"}. Refresh the order; do not send again or the client gets a duplicate.`,
              variant: "destructive",
            });
            return;
          }
          setInvoice((current) => (current && current.id === sentInvoice.id ? { ...current, status: "sent" } : current));
          emitOrderUpdated(orderId, "finance-payment-request-sent");
        }}
      />
      <MarkPaidDialog
        open={!!markPaid}
        invoice={markPaid}
        onOpenChange={(o) => { if (!o) setMarkPaid(null); }}
        onPaid={() => {
          setMarkPaid(null);
          emitOrderUpdated(orderId, "finance-record-payment", ["payment"] as any);
          toast({ title: "Payment recorded", description: "The order's paid and outstanding amounts are updated." });
        }}
        formatMoney={(n) => fmtZAR.format(n)}
      />
    </>
  );
}
