/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MarkPaidDialog - Wave 66.5.
 *
 * Per-row "$ Mark paid" action on /admin/invoices. The companion to
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
 *   - The "Send confirmation" toggle bridges the gap between recording
 *     the payment and telling the client it's been seen. Same mailto: /
 *     wa.me pattern as Wave 58 contact strip - no template registry
 *     plumbing needed because the operator can review and tweak the
 *     message before sending.
 *
 * Cross-system context block at the top shows Quote / Order / Invoice
 * IDs so the bookkeeper can sanity-check they have the right invoice
 * (e.g. when the client sent the EFT reference as the order number,
 * not the invoice number).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Mail,
  MessageCircle,
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

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function MarkPaidDialog({ open, invoice, onOpenChange, onPaid, formatMoney }: Props) {
  const { toast } = useToast();
  const { withSlug } = useTenantHref();

  const defaultAmount = Number(invoice?.balance_due ?? invoice?.total_amount ?? 0);
  const defaultReference = invoice?.invoice_number || "";

  const [amount, setAmount] = useState<string>(defaultAmount.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState<string>(defaultReference);
  const [dateReceived, setDateReceived] = useState<string>(todayIso());
  const [note, setNote] = useState<string>("");
  const [sendConfirmation, setSendConfirmation] = useState<boolean>(true);
  const [confirmChannel, setConfirmChannel] = useState<"email" | "whatsapp">("email");
  const [saving, setSaving] = useState<boolean>(false);

  // Reset state every time a new invoice opens. Pre-Wave-66.5 stale
  // amount from the last opened invoice would prefill the next dialog.
  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(Number(invoice.balance_due ?? invoice.total_amount ?? 0).toFixed(2));
    setPaymentMethod("bank_transfer");
    setReference(invoice.invoice_number || "");
    setDateReceived(todayIso());
    setNote("");
    // Bias default channel based on what we have. If only phone exists,
    // start on WhatsApp; otherwise email is the default because most
    // bookkeeping audit trails want it written.
    const hasEmail = !!invoice.orders?.clients?.email;
    const hasPhone = !!invoice.orders?.clients?.phone;
    setConfirmChannel(hasEmail ? "email" : hasPhone ? "whatsapp" : "email");
    setSendConfirmation(hasEmail || hasPhone);
    setSaving(false);
  }, [open, invoice?.id, invoice?.balance_due, invoice?.invoice_number, invoice?.orders?.clients?.email, invoice?.orders?.clients?.phone]);

  const clientName = invoice?.orders?.clients?.client_name || "Client";
  const clientEmail = invoice?.orders?.clients?.email || "";
  const clientPhone = invoice?.orders?.clients?.phone || "";
  const invoiceNumber = invoice?.invoice_number || "";
  const orderNumber = invoice?.orders?.order_number || "";
  const orderId = invoice?.order_id || "";
  const quoteId = invoice?.orders?.quote_id || "";

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= defaultAmount + 0.01;
  const overpayment = amountNum > defaultAmount + 0.01;
  const partialPayment = amountValid && amountNum < defaultAmount - 0.01;

  const composedMessage = useMemo(() => {
    const firstName = clientName.split(" ")[0] || "there";
    const amt = Number.isFinite(amountNum) ? formatMoney(amountNum) : formatMoney(defaultAmount);
    const balance = formatMoney(Math.max(0, defaultAmount - (Number.isFinite(amountNum) ? amountNum : 0)));
    const partial = partialPayment
      ? `\n\nOutstanding balance: ${balance}.`
      : "";
    return `Hi ${firstName},\n\nThank you, ${amt} received against ${invoiceNumber || "your invoice"}${orderNumber ? ` (${orderNumber})` : ""}. Payment confirmed.${partial}\n\nKind regards.`;
  }, [clientName, amountNum, defaultAmount, partialPayment, invoiceNumber, orderNumber, formatMoney]);

  const composedSubject = `Payment confirmed: ${invoiceNumber || "your invoice"}`;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(composedMessage);
      toast({ title: "Message copied", description: "Paste into your reply." });
    } catch {
      toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!invoice) return;
    if (!amountValid) {
      toast({
        title: overpayment ? "Amount too high" : "Amount required",
        description: overpayment
          ? `Outstanding balance is ${formatMoney(defaultAmount)}. Reduce the amount.`
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
      toast({
        title: status === "paid" ? "Invoice marked paid" : "Partial payment recorded",
        description: status === "paid"
          ? `${formatMoney(amountNum)} recorded against ${invoiceNumber || invoice.id.slice(0, 8)}.`
          : `${formatMoney(amountNum)} received. ${formatMoney((json as any)?.balanceDue || 0)} still outstanding.`,
      });

      // Optional confirmation send. Open in a new tab so the operator
      // can review + tweak before sending; same UX as the contact strip.
      if (sendConfirmation) {
        if (confirmChannel === "email" && clientEmail) {
          const href = `mailto:${clientEmail}?subject=${encodeURIComponent(composedSubject)}&body=${encodeURIComponent(composedMessage)}`;
          window.location.href = href;
        } else if (confirmChannel === "whatsapp" && clientPhone) {
          const cleanPhone = clientPhone.replace(/[^\d]/g, "");
          const href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(composedMessage)}`;
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }

      onPaid();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!invoice) return null;

  const canSendEmail = !!clientEmail;
  const canSendWa = !!clientPhone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-brand-primary" />
            Mark {invoiceNumber || "invoice"} paid
          </DialogTitle>
          <DialogDescription>
            {clientName} &middot; outstanding {formatMoney(defaultAmount)}
            {invoice.orders?.event_date && (
              <> &middot; event {invoice.orders.event_date}</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Cross-system context block. Lets the bookkeeper sanity-check
            they have the right invoice before recording the payment,
            with one click to the related artifact in each pillar. */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
            Linked records
          </div>
          <div className="flex flex-wrap gap-1.5">
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
                href={withSlug(`/order/${orderId}`)}
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
        </div>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mp-amount">Amount received</Label>
              <Input
                id="mp-amount"
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={overpayment ? "border-rose-300" : ""}
              />
              {overpayment && (
                <p className="text-[10px] text-rose-700">
                  Exceeds outstanding {formatMoney(defaultAmount)}.
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mp-reference">Reference</Label>
              <Input
                id="mp-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Bank statement reference"
              />
              <p className="text-[10px] text-slate-500">
                Doubles as idempotency key &middot; submitting the same reference twice records once.
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
            <Label htmlFor="mp-note">Internal note <span className="text-xs text-slate-400">(optional)</span></Label>
            <Textarea
              id="mp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything bookkeeping should know..."
            />
          </div>

          {/* Confirmation send block. mailto: / wa.me opens the
              operator's mail or WhatsApp with the body pre-filled --
              they review and send. No server-side template plumbing,
              same pattern as Wave 58 contact strip. */}
          <div className="rounded-md border border-slate-200 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="mp-confirm"
                checked={sendConfirmation}
                onCheckedChange={(v) => setSendConfirmation(!!v)}
                disabled={!canSendEmail && !canSendWa}
              />
              <Label htmlFor="mp-confirm" className="text-sm cursor-pointer">
                Send confirmation to {clientName}
              </Label>
            </div>
            {!canSendEmail && !canSendWa && (
              <p className="text-[11px] text-slate-500">
                No email or phone on file - add one to the contact before sending a confirmation.
              </p>
            )}
            {(canSendEmail || canSendWa) && sendConfirmation && (
              <>
                <div className="flex items-center gap-3">
                  <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer ${!canSendEmail ? "opacity-50" : ""}`}>
                    <input
                      type="radio"
                      name="mp-channel"
                      checked={confirmChannel === "email"}
                      onChange={() => setConfirmChannel("email")}
                      disabled={!canSendEmail}
                      className="accent-blue-600"
                    />
                    <Mail className="w-3.5 h-3.5" />
                    Email
                    {clientEmail && <span className="text-slate-500 truncate max-w-[180px]">{clientEmail}</span>}
                  </label>
                  <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer ${!canSendWa ? "opacity-50" : ""}`}>
                    <input
                      type="radio"
                      name="mp-channel"
                      checked={confirmChannel === "whatsapp"}
                      onChange={() => setConfirmChannel("whatsapp")}
                      disabled={!canSendWa}
                      className="accent-brand-primary"
                    />
                    <MessageCircle className="w-3.5 h-3.5 text-brand-primary" />
                    WhatsApp
                    {clientPhone && <span className="text-slate-500">{clientPhone}</span>}
                  </label>
                </div>
                <div className="rounded bg-slate-50 border border-slate-200 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Preview</p>
                  <p className="text-[11px] text-slate-700 whitespace-pre-wrap">{composedMessage}</p>
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="text-[10px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 mt-1"
                  >
                    <Copy className="w-2.5 h-2.5" /> Copy text
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Confirmation opens in your {confirmChannel === "email" ? "email client" : "WhatsApp"} after the payment is recorded so you can review before sending.
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !amountValid} className="bg-brand-primary hover:bg-brand-primary/90">
            {saving ? "Recording..." : partialPayment ? "Record partial payment" : "Mark paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
