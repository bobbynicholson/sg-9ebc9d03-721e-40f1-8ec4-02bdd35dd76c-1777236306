/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MarkPaidDialog - Wave 66.5.
 *
 * Per-row "Record payment" action on /admin/invoices. The companion to
 * the bulk-toolbar mark-paid: that flow is a one-click "settle these
 * 5 invoices at balance" toggle; this flow surfaces the payment
 * metadata (amount, method, reference, date, note) the bookkeeper
 * needs to record an actual transaction.
 *
 * Why a dedicated dialog (not "edit invoice"):
 *   - Mark-paid is the single most-fired action on this page. It deserves
 *     a focused surface rather than a deep dive into invoice editing.
 *   - Recording the method + reference makes the payments ledger usable
 *     for bank-statement reconciliation. Pre-Wave-66.5 every manual
 *     mark-paid landed as "manual" / "manual-{id}" which gave the
 *     bookkeeper no anchor when matching to the EFT statement.
 *   - The server sends the standard payment receipt after the ledger
 *     transaction succeeds. The dialog never opens the operator's local
 *     mail application, avoiding duplicate confirmations.
 *
 * Cross-system context block at the top shows Quote / Order / Invoice
 * IDs so the bookkeeper can sanity-check they have the right invoice
 * (e.g. when the client sent the EFT reference as the order number,
 * not the invoice number).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { staffOrderHref } from "@/lib/orderUrls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Receipt,
  FileText,
  ShoppingCart,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";

export interface MarkPaidDialogInvoice {
  id: string;
  invoice_number: string | null;
  total_amount: number | null;
  balance_due: number | null;
  currency?: string | null;
  order_id?: string | null;
  client_id?: string | null;
  orders?: {
    order_number?: string | null;
    quote_id?: string | null;
    event_date?: string | null;
    clients?: {
      client_name?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
  } | null;
}

interface Props {
  open: boolean;
  invoice: MarkPaidDialogInvoice | null;
  onOpenChange: (open: boolean) => void;
  onPaid: () => void;
  formatMoney: (n: number) => string;
}

const METHOD_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: "bank_transfer", label: "Bank transfer / EFT", hint: "Reference matches your bank statement entry." },
  { value: "cash", label: "Cash", hint: "Operator received cash on the day." },
  { value: "card", label: "Card (manual)", hint: "Card terminal or off-platform card payment." },
  { value: "cheque", label: "Cheque", hint: "Cheque number goes in reference." },
  { value: "manual", label: "Other / Manual adjustment", hint: "Catch-all for anything that doesn't fit above." },
];

function newUuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function MarkPaidDialog({ open, invoice, onOpenChange, onPaid, formatMoney }: Props) {
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  // Kept in state: using the client's credit lowers it while the dialog is open.
  const [balanceDue, setBalanceDue] = useState<number>(Number(invoice?.balance_due ?? invoice?.total_amount ?? 0));
  const defaultAmount = balanceDue;
  // Nothing is owed: anything recorded now is money on top (paid twice,
  // paid after settling) and must go to client credit or a refund.
  const alreadyPaid = !!invoice && defaultAmount <= 0.005;
  const defaultReference = invoice?.invoice_number || "";

  const [amount, setAmount] = useState<string>(defaultAmount.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState<string>(defaultReference);
  const [dateReceived, setDateReceived] = useState<string>(todayIso());
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [extraHandling, setExtraHandling] = useState<"credit" | "refund" | null>(null);
  // The client's store credit, usable against this invoice from here.
  const [creditAvailable, setCreditAvailable] = useState<number>(0);
  const [creditRequestId, setCreditRequestId] = useState<string>("");
  const [applyingCredit, setApplyingCredit] = useState<boolean>(false);
  // One duplicate-protection key per opening of the dialog. A double
  // click or retry of the same submission reuses it (recorded once);
  // the next payment on the same invoice gets a fresh key. The
  // reference used to be the key, and since it defaults to the invoice
  // number every second payment on an invoice was silently dropped.
  const [attemptKey, setAttemptKey] = useState<string>("");

  // Reset state every time a new invoice opens. Pre-Wave-66.5 stale
  // amount from the last opened invoice would prefill the next dialog.
  useEffect(() => {
    if (!open || !invoice) return;
    const owed = Number(invoice.balance_due ?? invoice.total_amount ?? 0);
    setBalanceDue(owed);
    setAmount(owed > 0.005 ? owed.toFixed(2) : "");
    setPaymentMethod("bank_transfer");
    setReference(invoice.invoice_number || "");
    setDateReceived(todayIso());
    setNote("");
    setExtraHandling(null);
    setAttemptKey(typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setSaving(false);
    setCreditAvailable(0);
    setCreditRequestId(newUuid());
    if (invoice.client_id && owed > 0.005) {
      fetch(`/api/admin/invoices/${invoice.id}/apply-credit`)
        .then((r) => r.json().catch(() => ({})))
        .then((j) => { if ((j as any)?.ok) setCreditAvailable(Number((j as any).available) || 0); })
        .catch(() => undefined);
    }
  }, [open, invoice?.id, invoice?.balance_due, invoice?.invoice_number]);

  const creditUsable = Number(Math.min(creditAvailable, defaultAmount).toFixed(2));
  const useCredit = async () => {
    if (!invoice || creditUsable <= 0) return;
    setApplyingCredit(true);
    try {
      const resp = await fetch(`/api/admin/invoices/${invoice.id}/apply-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: creditUsable, requestId: creditRequestId }),
      });
      const json = (await resp.json().catch(() => ({}))) as any;
      if (!resp.ok) {
        toast({ title: "Credit not used", description: json?.error || `Request failed (${resp.status})`, variant: "destructive" });
        return;
      }
      const used = Number(json.used) || 0;
      const left = Math.max(0, Number(json.balanceDue) || 0);
      setCreditAvailable((c) => Math.max(0, Number((c - used).toFixed(2))));
      setCreditRequestId(newUuid());
      setBalanceDue(left);
      setAmount(left > 0.005 ? left.toFixed(2) : "");
      if (left <= 0.005) {
        toast({ title: "Invoice paid with client credit", description: `${formatMoney(used)} of ${clientName}'s credit settled ${invoiceNumber || "the invoice"}.` });
        onPaid();
        onOpenChange(false);
        return;
      }
      toast({ title: `${formatMoney(used)} credit used`, description: `${formatMoney(left)} still to record as a payment.` });
    } finally {
      setApplyingCredit(false);
    }
  };

  // Not every caller passes the client (the order page doesn't); never show a placeholder name.
  const knownClientName = invoice?.orders?.clients?.client_name || null;
  const clientName = knownClientName || "This client";
  const invoiceNumber = invoice?.invoice_number || "";
  const orderNumber = invoice?.orders?.order_number || "";
  const orderId = invoice?.order_id || "";
  const quoteId = invoice?.orders?.quote_id || "";

  const amountNum = Number(amount);
  const overpayment = Number.isFinite(amountNum) && amountNum > defaultAmount + 0.01;
  const extraAmount = overpayment ? Number((amountNum - defaultAmount).toFixed(2)) : 0;
  // A client who paid more than owed: the team chooses what happens to the
  // extra (client credit or refund) instead of being blocked.
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && (!overpayment || !!extraHandling);
  const partialPayment = amountValid && amountNum < defaultAmount - 0.01;
  const canKeepCredit = !!invoice?.client_id;

  const handleSubmit = async () => {
    if (!invoice) return;
    if (!amountValid) {
      toast({
        title: overpayment ? "Choose what happens to the extra" : "Amount required",
        description: overpayment
          ? `The client paid ${formatMoney(extraAmount)} more than the ${formatMoney(defaultAmount)} owed. Keep it as client credit or refund it.`
          : "Enter the amount you received.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`/api/admin/invoices/${invoice.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          paymentMethod,
          reference: reference.trim() || null,
          idempotencyKey: attemptKey || null,
          extraHandling: overpayment ? extraHandling : null,
          // Server uses processed_at=NOW(); the operator-chosen date
          // lands in the audit note for traceability when bookkeeping
          // backdates an EFT received last week.
          note: [
            note.trim(),
            dateReceived && dateReceived !== todayIso() ? `Date received: ${dateReceived}` : "",
          ].filter(Boolean).join(" · "),
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast({
          title: "Could not record payment",
          description: (json as any)?.error || `Request failed (${resp.status})`,
          variant: "destructive",
        });
        return;
      }

      const status = (json as any)?.invoiceStatus || "paid";
      const extraWarning = (json as any)?.extraWarning as string | null | undefined;
      if (extraWarning) {
        toast({ title: "Payment recorded, extra not saved", description: extraWarning, variant: "destructive" });
      } else if (overpayment) {
        toast({
          title: "Invoice marked paid",
          description: extraHandling === "credit"
            ? `${formatMoney(amountNum)} received. ${formatMoney(extraAmount)} kept as client credit for their next booking.`
            : `${formatMoney(amountNum)} received. A ${formatMoney(extraAmount)} refund is waiting on Refunds & Credits to be paid out.`,
        });
      } else {
        toast({
          title: status === "paid" ? "Invoice marked paid" : "Partial payment recorded",
          description: status === "paid"
            ? `${formatMoney(amountNum)} recorded against ${invoiceNumber || invoice.id.slice(0, 8)}.`
            : `${formatMoney(amountNum)} received. ${formatMoney((json as any)?.balanceDue || 0)} still outstanding.`,
        });
      }

      onPaid();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-lg gap-3 overflow-y-auto p-4 sm:max-h-[90vh] sm:gap-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-7 text-base sm:items-center sm:text-lg">
            <CheckCircle2 className="w-5 h-5 text-brand-primary" />
            {alreadyPaid ? `Record extra payment for ${invoiceNumber || "invoice"}` : `Record payment for ${invoiceNumber || "invoice"}`}
          </DialogTitle>
          <DialogDescription>
            {knownClientName && <>{knownClientName} &middot; </>}
            {alreadyPaid ? "Already fully paid. Use this for money the client sent on top, for example if they paid twice." : <>Outstanding {formatMoney(defaultAmount)}</>}
            {invoice.orders?.event_date && (
              <> &middot; event {invoice.orders.event_date}</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Secondary record links stay available, but do not crowd the
            payment form on a phone. */}
        <details className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-600">Linked records</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quoteId && (
              <Link
                href={withSlug(`/admin/quotes/${quoteId}`)}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                title="Open the source quote"
              >
                <FileText className="w-3.5 h-3.5" />
                Quote
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </Link>
            )}
            {orderId && (
              <Link
                href={withSlug(staffOrderHref(orderId, "admin"))}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                title={orderNumber || "Open the order"}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                {orderNumber || "Order"}
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </Link>
            )}
            <span
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1"
              title="This invoice"
            >
              <Receipt className="w-3.5 h-3.5" />
              {invoiceNumber || "Invoice"}
            </span>
            {invoiceNumber && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invoiceNumber);
                    toast({ title: "Copied", description: `${invoiceNumber} on clipboard.` });
                  } catch { /* ignore */ }
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                title="Copy invoice number for the EFT reference"
              >
                <Copy className="w-3 h-3" />
                Copy ref
              </button>
            )}
          </div>
        </details>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mp-amount">Amount received</Label>
              <Input
                id="mp-amount"
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={overpayment ? "border-amber-300" : ""}
              />
              {overpayment && !alreadyPaid && (
                <p className="text-[10px] text-amber-700">
                  {formatMoney(extraAmount)} more than the {formatMoney(defaultAmount)} owed.
                </p>
              )}
              {partialPayment && (
                <p className="text-[10px] text-amber-700">
                  Partial &middot; {formatMoney(defaultAmount - amountNum)} left.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {creditUsable > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-brand-primary/20 bg-brand-primary/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate-700">
                {clientName} has <strong>{formatMoney(creditAvailable)}</strong> client credit.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={useCredit} disabled={applyingCredit || saving}>
                {applyingCredit ? "Using credit..." : `Use ${formatMoney(creditUsable)} credit on this invoice`}
              </Button>
            </div>
          )}

          {overpayment && (
            <div role="radiogroup" aria-labelledby="mp-extra-title" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p id="mp-extra-title" className="text-sm font-semibold text-slate-900">
                {alreadyPaid
                  ? <>Nothing is owed, so all <span className="tabular-nums">{formatMoney(extraAmount)}</span> is extra. What should happen to it?</>
                  : <>The client paid <span className="tabular-nums">{formatMoney(extraAmount)}</span> extra. What should happen to it?</>}
              </p>
              {([
                { value: "credit" as const, title: "Keep it as client credit", detail: "Used on their next booking.", disabled: !canKeepCredit,
                  note: canKeepCredit ? null : "Not available: this invoice has no client record." },
                { value: "refund" as const, title: "Refund it to the client", detail: "Added to Refunds & Credits for you to pay out.", disabled: false, note: null },
              ]).map((option) => {
                const selected = extraHandling === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex min-h-11 items-start gap-3 rounded-md border bg-white p-3 text-sm transition-colors ${
                      option.disabled ? "cursor-not-allowed border-slate-200 text-slate-400"
                        : selected ? "cursor-pointer border-brand-primary ring-2 ring-brand-primary/20 text-slate-900"
                        : "cursor-pointer border-slate-200 text-slate-800 hover:border-brand-primary/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mp-extra"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-primary"
                      checked={selected}
                      disabled={option.disabled}
                      onChange={() => setExtraHandling(option.value)}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{option.title}</span>
                      <span className="block text-xs text-slate-600">{option.note || option.detail}</span>
                    </span>
                  </label>
                );
              })}
              {!extraHandling && (
                <p className="text-xs text-amber-800">Choose one to record this payment.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mp-reference">Reference</Label>
              <Input
                id="mp-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Bank statement reference"
              />
              <p className="text-[10px] text-slate-500">
                Shown on the payment record. Several payments can share the same reference.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-date">Date received</Label>
              <Input
                id="mp-date"
                type="date"
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mp-note">Payment note <span className="text-xs text-slate-400">(optional)</span></Label>
            <Textarea
              id="mp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything bookkeeping should know..."
            />
          </div>

          <p className="rounded-md border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-xs text-slate-600">
            A standard payment receipt is sent through the portal after the payment is recorded. Your email application will not open.
          </p>
        </div>

        <DialogFooter className="gap-2 border-t pt-3 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !amountValid} className="w-full bg-brand-primary hover:bg-brand-primary/90 sm:w-auto">
            {saving
              ? "Recording..."
              : overpayment && extraHandling === "credit"
                ? `Record payment and keep ${formatMoney(extraAmount)} as credit`
                : overpayment && extraHandling === "refund"
                  ? `Record payment and refund ${formatMoney(extraAmount)}`
                  : partialPayment ? "Record partial payment" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
