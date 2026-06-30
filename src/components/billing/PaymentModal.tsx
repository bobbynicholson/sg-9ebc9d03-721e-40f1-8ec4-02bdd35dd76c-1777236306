/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PaymentModal - the client picks a method and pays.
 *
 * Two live branches:
 *   - "Pay online": dispatches via /api/payments/create-session, which
 *     resolves whichever gateway the catering company set as active in
 *     /admin/payment-gateways (PayFast / Yoco / Stripe) and returns a
 *     redirect URL or self-posting form snippet. We deliberately don't
 *     label the button with the provider name - the tenant's choice
 *     should be invisible to their clients.
 *   - EFT: the smart flow Bobby asked for. Shows the catering
 *     company's bank details, hammers home the reference (the
 *     invoice number) with a copy button, then offers an "I've made
 *     the EFT payment" CTA that:
 *       - records a payments row with status=pending, method=eft,
 *         payment_reference = invoice.invoice_number,
 *       - notifies the company's admins so they reconcile against
 *         the bank statement,
 *       - shows the client a "we're checking" confirmation.
 *
 * Wrong references are the #1 reconciliation problem in catering
 * EFTs. The whole point of this modal is to make using the right one
 * easier than not.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard, Loader2, Lock, CheckCircle,
  Copy, ClipboardCheck, AlertCircle, Landmark, Calendar, Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalISO } from "@/lib/localDate";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  order_number: string;
  amount: number;
  currency: string;
  status: string;
}

interface PaymentModalProps {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
  /** Optional handler - when set, the success state shows an inline
   *  "Download receipt" button that asks the parent to open a
   *  ReceiptDialog scoped to this invoice. We hand off rather than
   *  embedding so there's never two dialogs stacked. */
  onShowReceipt?: (invoiceId: string) => void;
  /** Wave 29.2: optional public token. When the modal is rendered
   *  from a magic-link surface (/c/order/[id], /pay/i/[token]) we
   *  pass the token through so the credit-balance lookup and
   *  redeem call both authenticate via token-bearer rather than
   *  Supabase auth. */
  publicToken?: string;
}

type Method = "online" | "eft";

export function PaymentModal({ invoice, open, onClose, onPaymentSuccess, onShowReceipt, publicToken }: PaymentModalProps) {
  const { toast } = useToast();
  const { company } = useAuth() as any;

  // Pull bank fields off the resolved tenant. If the company hasn't
  // populated any of them, the EFT option won't be offered at all --
  // showing a half-empty card just confuses clients.
  const bank = {
    name: (company?.bank_name as string) || "",
    holder: (company?.bank_account_holder as string) || "",
    account: (company?.bank_account_number as string) || "",
    branch: (company?.bank_branch_code as string) || "",
    accountType: (company?.bank_account_type as string) || "",
    instructions: (company?.eft_instructions as string) || "",
  };
  const eftAvailable = Boolean(bank.name && bank.account);

  const [paymentMethod, setPaymentMethod] = useState<Method>(
    eftAvailable ? "eft" : "online",
  );
  const [processing, setProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [eftClaimed, setEftClaimed] = useState(false);

  // Default the "when did you pay?" date to today. The client can
  // edit if they paid earlier and only got around to confirming now.
  const [eftPaidAt, setEftPaidAt] = useState<string>(() => {
    const d = new Date();
    return toLocalISO(d);
  });
  const [eftNotes, setEftNotes] = useState("");
  const [confirmingClaim, setConfirmingClaim] = useState(false);

  // Wave 29.2: store-credit balance + apply toggle. Fetched on open
  // via /api/payments/credit-balance which mirrors create-session's
  // auth gate. When available > 0, the modal renders a green panel
  // above the method picker offering to net the credit.
  const [creditAvailable, setCreditAvailable] = useState<number>(0);
  const [creditMaxApplicable, setCreditMaxApplicable] = useState<number>(0);
  const [applyCredit, setApplyCredit] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !invoice?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/payments/credit-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoice_id: invoice.id,
            public_token: publicToken || undefined,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (cancelled || !r.ok || !j?.ok) return;
        setCreditAvailable(Number(j.available) || 0);
        setCreditMaxApplicable(Number(j.maxApplicable) || 0);
        // Default the toggle on when there's any credit - catering
        // cashflow win, and the client can untick if they prefer to
        // keep the credit for later.
        if (Number(j.maxApplicable) > 0) setApplyCredit(true);
      } catch {
        // Silent - credit is a soft feature; the pay flow still
        // works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoice?.id, publicToken]);

  const fmtCurrency = (n: number) =>
    `${invoice.currency}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const netAmount = applyCredit
    ? Math.max(0, invoice.amount - creditMaxApplicable)
    : invoice.amount;

  const startOnlinePayment = async () => {
    // Wave 29.2: pass the apply-credit toggle through. The endpoint
    // calls the redeem_client_credit RPC under a per-wallet advisory
    // lock so a mash-click can't double-spend. When credit covers
    // the full bill, the response carries {settled:true} and we
    // skip the gateway hop entirely.
    const r = await fetch("/api/payments/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: invoice.id,
        public_token: publicToken || undefined,
        apply_credit: applyCredit,
        apply_credit_amount: applyCredit ? creditMaxApplicable : undefined,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) {
      throw new Error(j?.error || "Could not start the payment");
    }

    if (j.settled === true) {
      // Credit covered the whole invoice - no gateway needed.
      toast({
        title: "Paid with store credit",
        description: `Applied ${fmtCurrency(j.creditApplied || creditMaxApplicable)}; nothing left to charge.`,
      });
      setPaymentComplete(true);
      onPaymentSuccess();
      return;
    }

    if (j.creditApplied > 0) {
      toast({
        title: "Credit applied",
        description: `Applied ${fmtCurrency(j.creditApplied)} - redirecting you to pay the remaining ${fmtCurrency(netAmount)}.`,
      });
    }

    const paymentUrl: string = j.paymentUrl;
    const isHtmlForm: boolean = !!j.isHtmlForm;
    if (!paymentUrl) {
      throw new Error("Payment provider returned no redirect URL");
    }
    if (isHtmlForm) {
      // PayFast self-submitting form - inject and post.
      const div = document.createElement("div");
      div.innerHTML = paymentUrl;
      document.body.appendChild(div);
      const form = div.querySelector("form") as HTMLFormElement | null;
      if (form) {
        form.submit();
      } else {
        throw new Error("Provider form failed to render");
      }
    } else {
      window.location.href = paymentUrl;
    }
  };

  const handlePayment = async () => {
    try {
      setProcessing(true);
      if (paymentMethod === "online") {
        await startOnlinePayment();
        return;
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: "Payment failed",
        description: dbErrorMessage(error, { entity: "payment" }),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const submitEftClaim = async () => {
    try {
      setProcessing(true);
      const res = await fetch("/api/payments/claim-eft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          claimed_amount: invoice.amount,
          claimed_paid_at: eftPaidAt,
          notes: eftNotes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Could not log your payment claim");
      }
      setEftClaimed(true);
      toast({
        title: "Thanks - we've notified them",
        description: "The team will check the bank account and confirm your payment.",
      });
      setTimeout(onPaymentSuccess, 1500);
    } catch (e: any) {
      toast({
        title: "Couldn't record your claim",
        description: dbErrorMessage(e, { entity: "payment" }),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
      setConfirmingClaim(false);
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `Copied ${label}` });
    } catch {
      toast({
        title: "Copy failed",
        description: "Long-press the value to copy manually.",
        variant: "destructive",
      });
    }
  };

  // ─── Success / claimed states ────────────────────────────────────────
  if (paymentComplete) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-brand-primary/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-brand-primary" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful</h3>
            <p className="text-slate-600 mb-4">
              Your payment of {invoice.currency}{invoice.amount.toLocaleString()} has been processed.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              We've also emailed a copy. Tap below to download a SARS-friendly receipt right now.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {onShowReceipt && (
                <Button
                  onClick={() => {
                    onShowReceipt(invoice.id);
                    onClose();
                  }}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90"
                >
                  Download receipt
                </Button>
              )}
              <Button
                onClick={onClose}
                variant={onShowReceipt ? "outline" : "default"}
                className="flex-1"
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (eftClaimed) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardCheck className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Thanks - we've let them know</h3>
            <p className="text-slate-600 mb-4">
              The team will reconcile against the bank statement and mark{" "}
              <span className="font-semibold">{invoice.invoice_number}</span> as paid once the transfer lands.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              You'll see the status update on your billing page within 1-2 business days.
            </p>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Confirm-claim sub-dialog ────────────────────────────────────────
  if (confirmingClaim) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Last check before we tell them
            </DialogTitle>
            <DialogDescription>
              Only tap confirm if you've actually sent the EFT.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3 text-sm text-slate-700">
            <p>
              <strong>What happens next:</strong> we log your claim, the catering team gets a
              notification, and they'll match it against the bank statement using the
              reference <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono">{invoice.invoice_number}</code>.
            </p>
            <p>
              If the reference is wrong or the amount doesn't match, the transfer might bounce
              back to you and the invoice stays unpaid - so double-check before confirming.
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmingClaim(false)}
              disabled={processing}
            >
              Wait, let me check
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={submitEftClaim}
              disabled={processing}
            >
              {processing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending</>
              ) : (
                <>Yes, I've paid - notify them</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Main modal ──────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay {invoice.invoice_number}</DialogTitle>
          <DialogDescription>
            Pick how you'd like to settle the {invoice.currency}
            {invoice.amount.toLocaleString()} balance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-50 rounded-lg">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-slate-600">Invoice</span>
              <span className="font-semibold text-slate-900">{invoice.invoice_number}</span>
            </div>
            {invoice.order_number && (
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-600">Order</span>
                <span className="font-semibold text-slate-900">{invoice.order_number}</span>
              </div>
            )}
            <Separator className="my-3" />
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900">Amount due</span>
              <span className="text-2xl font-bold text-blue-600">
                {fmtCurrency(invoice.amount)}
              </span>
            </div>
            {applyCredit && creditMaxApplicable > 0 && netAmount !== invoice.amount && (
              <div className="mt-3 pt-3 border-t border-blue-200 space-y-1.5 text-sm">
                <div className="flex justify-between text-brand-primary">
                  <span>Store credit applied</span>
                  <span className="font-semibold tabular-nums">
                    -{fmtCurrency(creditMaxApplicable)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Remaining to pay</span>
                  <span className="tabular-nums">{fmtCurrency(netAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Wave 29.2: store-credit toggle. Only shown when the
              client actually has credit on file. Default-on (cashflow
              win for the catering company); the client can untick if
              they'd rather hold the credit for a future booking. */}
          {creditAvailable > 0 && (
            <div className="rounded-xl border-2 border-brand-primary/20 bg-brand-primary/10 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyCredit}
                  onChange={(e) => setApplyCredit(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-brand-primary/40 text-brand-primary focus:ring-brand-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-brand-primary" />
                    <span className="font-semibold text-brand-primary">
                      Apply your store credit
                    </span>
                  </div>
                  <p className="text-sm text-brand-primary mt-1">
                    You have <strong>{fmtCurrency(creditAvailable)}</strong> in
                    credit on file.
                    {creditMaxApplicable < creditAvailable
                      ? ` We'll apply ${fmtCurrency(creditMaxApplicable)} to this invoice and keep the rest on your account.`
                      : creditMaxApplicable >= invoice.amount
                        ? " That covers this whole invoice - nothing left to charge."
                        : ` We'll apply it all and you'll only pay ${fmtCurrency(netAmount)} for the rest.`}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Method picker */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Payment method</Label>
            <RadioGroup value={paymentMethod} onValueChange={(val) => setPaymentMethod(val as Method)}>
              <div className="space-y-3">
                <MethodCard
                  active={paymentMethod === "online"}
                  value="online"
                  onSelect={() => setPaymentMethod("online")}
                  icon={<CreditCard className="w-5 h-5 text-blue-600" />}
                  title="Pay online"
                  subtitle="Card payment, reflects straight away"
                />
                {eftAvailable ? (
                  <MethodCard
                    active={paymentMethod === "eft"}
                    value="eft"
                    onSelect={() => setPaymentMethod("eft")}
                    icon={<Landmark className="w-5 h-5 text-brand-primary" />}
                    title="Manual EFT / bank transfer"
                    subtitle="Pay from your banking app, then tell them"
                  />
                ) : null}
              </div>
            </RadioGroup>
          </div>

          {paymentMethod === "eft" ? (
            <EftPanel
              invoice={invoice}
              bank={bank}
              eftPaidAt={eftPaidAt}
              setEftPaidAt={setEftPaidAt}
              eftNotes={eftNotes}
              setEftNotes={setEftNotes}
              onCopy={copy}
            />
          ) : (
            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
              <Lock className="w-4 h-4 text-slate-500 mt-0.5" />
              <p className="text-xs text-slate-600">
                Your payment information is encrypted in transit. We never store your card details.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={processing}>
              Cancel
            </Button>
            {paymentMethod === "eft" ? (
              <Button
                onClick={() => setConfirmingClaim(true)}
                className="flex-1 bg-brand-primary hover:bg-brand-primary/90"
                disabled={processing}
              >
                <ClipboardCheck className="w-4 h-4 mr-2" />
                I've made the EFT payment
              </Button>
            ) : (
              <Button
                onClick={handlePayment}
                className="flex-1 bg-brand-primary"
                disabled={processing}
              >
                {processing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing</>
                ) : netAmount <= 0 ? (
                  // Wave 29.2: full credit cover - the gateway hop
                  // is skipped server-side. Surface that to the
                  // client up-front rather than redirecting them
                  // somewhere they don't need to go.
                  <><Wallet className="w-4 h-4 mr-2" />
                    Settle with {fmtCurrency(creditMaxApplicable)} credit
                  </>
                ) : (
                  <><CreditCard className="w-4 h-4 mr-2" />
                    Pay {fmtCurrency(netAmount)}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── EFT panel: bank details + reference + when-did-you-pay ────────────

function EftPanel({
  invoice,
  bank,
  eftPaidAt,
  setEftPaidAt,
  eftNotes,
  setEftNotes,
  onCopy,
}: {
  invoice: Invoice;
  bank: {
    name: string; holder: string; account: string;
    branch: string; accountType: string; instructions: string;
  };
  eftPaidAt: string;
  setEftPaidAt: (v: string) => void;
  eftNotes: string;
  setEftNotes: (v: string) => void;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/*
        The reference is the entire point of the flow - if the client
        types something else into their banking app, the payment becomes
        a needle in a haystack on the caterer's side. Make it the
        biggest, most copy-able thing on the screen.
      */}
      <div className="rounded-xl border-2 border-brand-primary/30 bg-brand-primary/10 p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-primary">
            Use this reference - exactly
          </span>
          <button
            type="button"
            onClick={() => onCopy("reference", invoice.invoice_number)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:text-brand-primary"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>
        <p className="font-mono text-xl sm:text-2xl font-bold text-brand-primary break-all leading-tight">
          {invoice.invoice_number}
        </p>
        <p className="text-xs text-brand-primary mt-1">
          Without this reference your payment can't be matched to the invoice.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
          <Landmark className="w-4 h-4 text-brand-primary" />
          <span className="text-sm font-semibold text-slate-800">Banking details</span>
        </div>
        <div className="divide-y divide-slate-100">
          <BankRow label="Bank" value={bank.name} onCopy={() => onCopy("bank name", bank.name)} />
          {bank.holder && (
            <BankRow label="Account holder" value={bank.holder} onCopy={() => onCopy("account holder", bank.holder)} />
          )}
          <BankRow label="Account number" value={bank.account} onCopy={() => onCopy("account number", bank.account)} mono />
          {bank.branch && (
            <BankRow label="Branch code" value={bank.branch} onCopy={() => onCopy("branch code", bank.branch)} mono />
          )}
          {bank.accountType && (
            <BankRow label="Account type" value={bank.accountType} onCopy={() => onCopy("account type", bank.accountType)} />
          )}
          <BankRow label="Amount" value={`${invoice.currency}${invoice.amount.toLocaleString()}`} onCopy={() => onCopy("amount", String(invoice.amount))} mono />
        </div>
        {bank.instructions && (
          <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-600 italic">
            {bank.instructions}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-800">Once you've paid, tell us</p>
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs font-semibold text-slate-700">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date you paid
            </span>
            <input
              type="date"
              value={eftPaidAt}
              max={toLocalISO(new Date())}
              onChange={(e) => setEftPaidAt(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Note for the team (optional)
            <textarea
              value={eftNotes}
              onChange={(e) => setEftNotes(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="e.g. paid from FNB at 14:32, transfer ref XYZ"
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm resize-none"
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">
          Tap &quot;I&apos;ve made the EFT payment&quot; once the transfer is sent. The team will
          reconcile against the bank account and mark the invoice paid - usually within 1-2
          business days.
        </p>
      </div>
    </div>
  );
}

function BankRow({
  label, value, onCopy, mono = false,
}: { label: string; value: string; onCopy: () => void; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-xs font-medium text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-slate-900 truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="text-slate-400 hover:text-brand-primary flex-shrink-0"
        aria-label={`Copy ${label}`}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function MethodCard({
  active, value, onSelect, icon, title, subtitle,
}: {
  active: boolean;
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
        active ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
      }`}
      onClick={onSelect}
    >
      <RadioGroupItem value={value} id={value} />
      <Label htmlFor={value} className="flex items-center gap-2 cursor-pointer flex-1">
        {icon}
        <div>
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </Label>
    </div>
  );
}
