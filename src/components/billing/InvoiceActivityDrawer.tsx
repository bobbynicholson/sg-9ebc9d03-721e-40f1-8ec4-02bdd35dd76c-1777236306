/**
 * InvoiceActivityDrawer - Wave 67.
 *
 * Per-invoice activity timeline composed from existing tables:
 *  - email_automation_log (sent / failed events keyed by invoice_id
 *    via the order_id link)
 *  - payments (deposit / balance / refund keyed by order_id)
 *  - invoice row scalars (created_at, sent_at, paid_at,
 *    last_synced_at, sync_error)
 *
 * No new table - the audit trail already exists, just wasn't
 * surfaced. Bookkeepers chasing "did this client open the invoice
 * email" or "when did the EFT clear" had to drill into multiple
 * admin pages; now it's one drawer per invoice.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CheckCircle2, AlertCircle, Send, CreditCard, CloudUpload, FileText, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReverseManualPaymentDialog, type ReversiblePayment } from "@/components/billing/ReverseManualPaymentDialog";

interface ActivityEntry {
  ts: string;
  icon: any;
  label: string;
  detail?: string;
  tone: "blue" | "green" | "rose" | "slate" | "amber";
  reversiblePayment?: ReversiblePayment;
}

const TONE_CLASS: Record<ActivityEntry["tone"], string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-900",
  green: "bg-brand-primary/10 border-brand-primary/20 text-brand-primary",
  rose: "bg-rose-50 border-rose-200 text-rose-900",
  slate: "bg-slate-50 border-slate-200 text-slate-700",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
};

function formatActivityAmount(amount: unknown, currencyCode: unknown): string {
  const currency = String(currencyCode || "ZAR").toUpperCase();
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: any | null;
}

export function InvoiceActivityDrawer({ open, onOpenChange, invoice, onPaymentReversed }: Props & { onPaymentReversed?: () => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState<ReversiblePayment | null>(null);

  useEffect(() => {
    if (!open || !invoice?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: ActivityEntry[] = [];

      // 1. Invoice scalars
      if (invoice.created_at) {
        out.push({
          ts: invoice.created_at,
          icon: FileText,
          label: "Invoice generated",
          detail: invoice.invoice_number || undefined,
          tone: "slate",
        });
      }
      if (invoice.sent_at) {
        out.push({
          ts: invoice.sent_at,
          icon: Send,
          label: "Sent to client",
          tone: "blue",
        });
      }
      if (invoice.paid_at) {
        out.push({
          ts: invoice.paid_at,
          icon: CheckCircle2,
          label: "Paid in full",
          tone: "green",
        });
      }
      if (invoice.last_synced_at) {
        out.push({
          ts: invoice.last_synced_at,
          icon: CloudUpload,
          label: invoice.sync_error ? "Sync failed" : "Synced to accounting",
          detail: invoice.sync_error || undefined,
          tone: invoice.sync_error ? "rose" : "slate",
        });
      }

      // 2. Email automation log entries (sent / failed by template_type)
      try {
        const { data: emails } = await (supabase as any)
          .from("email_automation_log")
          .select("template_type, status, sent_at, recipient_email, error_message")
          .eq("order_id", invoice.order_id)
          .like("template_type", "%invoice%")
          .order("sent_at", { ascending: false });
        for (const e of (emails || []) as any[]) {
          const failed = e.status !== "sent";
          out.push({
            ts: e.sent_at,
            icon: failed ? AlertCircle : Send,
            label: failed
              ? `Email failed (${e.template_type})`
              : `Email sent (${e.template_type})`,
            detail: failed
              ? e.error_message || "unknown error"
              : `to ${e.recipient_email}`,
            tone: failed ? "rose" : "blue",
          });
        }
      } catch (e) {
        console.warn("[InvoiceActivityDrawer] emails fetch failed:", e);
      }

      // 3. Settled or claimed payment ledger entries. Invoice payments
      // are keyed by invoice_id; older order-level payments may have no
      // invoice_id, so include those only when they belong to this order.
      try {
        let paymentQuery = (supabase as any)
          .from("payments")
          .select("id, payment_type, status:payment_status, processed_at, created_at, amount, currency, payment_method, gateway_provider, payment_reference, gateway_transaction_id")
          .eq("company_id", invoice.company_id);
        paymentQuery = invoice.order_id
          ? paymentQuery.or(`invoice_id.eq.${invoice.id},and(invoice_id.is.null,order_id.eq.${invoice.order_id})`)
          : paymentQuery.eq("invoice_id", invoice.id);
        const { data: payments, error: paymentError } = await paymentQuery
          .order("created_at", { ascending: false });
        if (paymentError) throw paymentError;
        for (const p of (payments || []) as any[]) {
          const status = String(p.status || "unknown").toLowerCase();
          const reference = p.payment_reference || p.gateway_transaction_id;
          out.push({
            ts: p.processed_at || p.created_at || new Date().toISOString(),
            icon: CreditCard,
            label: `${p.payment_type ? p.payment_type.charAt(0).toUpperCase() + p.payment_type.slice(1) : "Payment"} payment · ${status}`,
            detail: `${formatActivityAmount(p.amount, p.currency || invoice.currency)} via ${p.payment_method || p.gateway_provider || "manual"}${reference ? ` · ref ${reference}` : ""}`,
            tone: ["completed", "paid", "succeeded"].includes(status)
              ? "green"
              : ["failed", "rejected"].includes(status)
                ? "rose"
                : "amber",
            reversiblePayment: status === "completed" && p.gateway_provider === "manual" && !p.payment_type
              ? { id: p.id, amount: Number(p.amount) || 0, currency: p.currency, payment_reference: p.payment_reference }
              : undefined,
          });
        }
      } catch (e) {
        console.warn("[InvoiceActivityDrawer] payments fetch failed:", e);
      }

      // 4. Hosted checkout attempts are separate from confirmed money.
      // Showing pending/failed attempts explains why an attempted payment
      // may not yet appear in the invoice's paid-to-date total.
      try {
        const { data: attempts, error: attemptError } = await (supabase as any)
          .from("payment_attempts")
          .select("provider, payment_type, amount, currency, status, provider_status, failure_reason, created_at, succeeded_at, failed_at")
          .eq("company_id", invoice.company_id)
          .eq("invoice_id", invoice.id)
          .order("created_at", { ascending: false });
        if (attemptError) throw attemptError;
        for (const attempt of (attempts || []) as any[]) {
          const status = String(attempt.status || "unknown").toLowerCase();
          const provider = String(attempt.provider || "online").toUpperCase();
          out.push({
            ts: attempt.succeeded_at || attempt.failed_at || attempt.created_at || new Date().toISOString(),
            icon: CreditCard,
            label: `Checkout attempt · ${provider} · ${status}`,
            detail: `${formatActivityAmount(attempt.amount, attempt.currency || invoice.currency)}${attempt.provider_status ? ` · ${attempt.provider_status}` : ""}${attempt.failure_reason ? ` · ${attempt.failure_reason}` : ""}`,
            tone: status === "succeeded"
              ? "green"
              : ["failed", "expired"].includes(status)
                ? "rose"
                : "amber",
          });
        }
      } catch (e) {
        console.warn("[InvoiceActivityDrawer] checkout attempts fetch failed:", e);
      }

      // 5. Sort newest first
      out.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      if (!cancelled) {
        setEntries(out);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, invoice?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none border-0 p-3 sm:p-6 lg:p-8">
        <SheetHeader className="mx-auto w-full max-w-5xl pr-12 text-left">
          <SheetTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base sm:text-lg">
            <Clock className="h-5 w-5" />
            Activity log
            {invoice?.invoice_number && <span className="break-all font-mono text-sm text-slate-500">{invoice.invoice_number}</span>}
          </SheetTitle>
          <SheetDescription className="text-xs sm:text-sm">
            Every event on {invoice?.invoice_number || "this invoice"}: generated, sent, opened, paid, synced. Newest first.
          </SheetDescription>
        </SheetHeader>
        <div className="mx-auto mt-5 w-full max-w-5xl space-y-2">
          {loading && (
            <p role="status" className="text-sm text-slate-500">Loading activity…</p>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          )}
          {entries.map((e, i) => {
            const Icon = e.icon;
            const reversiblePayment = e.reversiblePayment;
            return (
              <div key={i} className={`flex min-w-0 items-start gap-3 rounded-md border ${TONE_CLASS[e.tone]} px-3 py-2.5 sm:px-4`}>
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="break-words text-xs font-semibold leading-tight sm:text-sm">{e.label}</p>
                  {e.detail && (
                    <p className="mt-0.5 break-words text-[11px] opacity-75 sm:text-xs">{e.detail}</p>
                  )}
                  <p className="mt-0.5 text-[10px] opacity-60 tabular-nums sm:text-[11px]">
                    {(() => {
                      try {
                        return format(new Date(e.ts), "dd MMM yyyy 'at' HH:mm");
                      } catch { return e.ts; }
                    })()}
                  </p>
                  {reversiblePayment && <Button type="button" variant="ghost" size="sm" className="mt-1 h-10 px-3 text-xs text-rose-700 hover:bg-rose-100 hover:text-rose-800 sm:h-8" onClick={() => setPaymentToReverse(reversiblePayment)}>Reverse manual payment</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
      <ReverseManualPaymentDialog open={!!paymentToReverse} payment={paymentToReverse} onOpenChange={(isOpen) => { if (!isOpen) setPaymentToReverse(null); }} onReversed={() => onPaymentReversed?.()} />
    </Sheet>
  );
}
