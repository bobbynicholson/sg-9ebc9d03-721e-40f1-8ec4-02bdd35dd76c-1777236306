/**
 * Wave 28.3 -- 3-step Cancellation Companion wizard.
 *
 * Drops into any client-facing surface (magic-link order, magic-link
 * quote, auth client portal). Same component, props-driven by `mode`.
 *
 * The wizard is the "first line of defence" Bobby asked for: the
 * client sees the consequences before they confirm, gets a credit
 * vs refund choice, and the system handles the cancel without the
 * catering company touching the phone.
 *
 * Step 1 -- Tell us why    (reason chips + free text, optional)
 * Step 2 -- Here's what happens   (rules engine output, plain English)
 * Step 3 -- How would you like the difference handled?  (credit / refund)
 *
 * Every step has a "Note before action" panel so the client knows
 * what is and isn't about to happen. Bobby brief: "every action needs
 * a note before the action."
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Phone,
  Wallet,
  CreditCard,
  Loader2,
  XCircle,
  CalendarClock,
} from "lucide-react";
import { computeCancellationTerms } from "@/services/cancellation/computeCancellationTerms";
import type {
  CancellationInput,
  CancellationTerms,
} from "@/services/cancellation/types";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type CancellationMode = "order" | "quote";

export interface CancellationWizardSubmit {
  reason_category: string;
  reason: string;
  payout_choice: "refund" | "credit";
  credit_amount: number;
  refund_amount: number;
  committed_cost_note: string | null;
}

export interface CancellationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "order" runs the full flow with payout + chain reactions; "quote" just decline. */
  mode: CancellationMode;
  /** Catering company display name -- used in copy. */
  companyName: string;
  /** Catering company phone -- shown when wizard is blocked (post-dispatch). */
  companyPhone?: string | null;
  /**
   * Inputs to the rules engine. Keep this lean -- the component derives
   * everything from it without going to the network until the user
   * presses Confirm.
   */
  termsInput: CancellationInput;
  /** Optional: prefer postpone -- shows the "Switch to postpone" CTA. */
  onPostponeRequest?: () => void;
  /** Async submit handler -- the wrapping page does the API call. */
  onSubmit: (payload: CancellationWizardSubmit) => Promise<void>;
}

// ----------------------------------------------------------------------
// Reason chips
// ----------------------------------------------------------------------

const ORDER_REASONS = [
  { key: "event_postponed", label: "Event postponed" },
  { key: "budget_changed", label: "Budget changed" },
  { key: "found_other", label: "Found another caterer" },
  { key: "personal", label: "Personal reason" },
  { key: "force_majeure", label: "Force majeure" },
  { key: "other", label: "Other" },
];

const QUOTE_REASONS = [
  { key: "budget", label: "Out of budget" },
  { key: "found_other", label: "Found another caterer" },
  { key: "wrong_fit", label: "Not the right fit" },
  { key: "event_cancelled", label: "Event no longer happening" },
  { key: "other", label: "Other" },
];

// ----------------------------------------------------------------------
// Money formatter
// ----------------------------------------------------------------------

const fmtMoney = (n: number, code = "ZAR") => {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(n || 0);
  } catch {
    return `R${(n || 0).toFixed(0)}`;
  }
};

// ----------------------------------------------------------------------
// Note-before-action panel -- the recurring "here's what's about to
// happen" callout. Bobby's brief says this MUST appear at every step.
// ----------------------------------------------------------------------

function NoteBeforeAction({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const palette = {
    info: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      title: "text-blue-900",
      body: "text-blue-800",
      icon: Info,
      iconColor: "text-blue-500",
    },
    warning: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      title: "text-amber-900",
      body: "text-amber-800",
      icon: AlertCircle,
      iconColor: "text-amber-500",
    },
    danger: {
      bg: "bg-rose-50",
      border: "border-rose-200",
      title: "text-rose-900",
      body: "text-rose-800",
      icon: XCircle,
      iconColor: "text-rose-500",
    },
  }[tone];
  const Icon = palette.icon;
  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${palette.iconColor}`} />
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${palette.title}`}>{title}</p>
          <div className={`text-sm leading-relaxed ${palette.body} mt-1`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------

export function CancellationWizard({
  open,
  onOpenChange,
  mode,
  companyName,
  companyPhone,
  termsInput,
  onPostponeRequest,
  onSubmit,
}: CancellationWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reasonKey, setReasonKey] = useState<string>("");
  const [reasonText, setReasonText] = useState<string>("");
  const [payout, setPayout] = useState<"refund" | "credit">("credit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live recompute -- pure function, no network. Re-derives on every
  // state change so the preview stays accurate.
  const terms: CancellationTerms = useMemo(
    () => computeCancellationTerms(termsInput),
    [termsInput],
  );

  const reasonOptions = mode === "order" ? ORDER_REASONS : QUOTE_REASONS;
  const isQuote = mode === "quote";
  const blocked = !isQuote && terms.blocked;
  const hasMoney = !isQuote && (terms.refundAmount > 0 || terms.creditAmount > 0);

  const reset = () => {
    setStep(1);
    setReasonKey("");
    setReasonText("");
    setPayout("credit");
    setSubmitting(false);
    setError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        reason_category: reasonKey || "other",
        reason: reasonText.trim(),
        payout_choice: payout,
        credit_amount: payout === "credit" ? terms.creditAmount : 0,
        refund_amount: payout === "refund" ? terms.refundAmount : 0,
        committed_cost_note: terms.committedCostNote,
      });
      close();
    } catch (e: any) {
      setError(e?.message || "Something went wrong -- please try again.");
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------------
  // Blocked path -- post-dispatch, completed, already cancelled.
  // The wizard short-circuits to a "call us" panel and never lets the
  // client confirm.
  // ------------------------------------------------------------------
  if (blocked && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-rose-900">
              We can't cancel this from here
            </DialogTitle>
            <DialogDescription>
              Self-service cancellation isn't safe at this point.
            </DialogDescription>
          </DialogHeader>
          <NoteBeforeAction tone="danger" title="What's happening">
            {blocked.reason}
          </NoteBeforeAction>
          {companyPhone ? (
            <a
              href={`tel:${companyPhone}`}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium py-3 px-4 transition-colors"
            >
              <Phone className="h-4 w-4" /> Call {companyName}
              <span className="opacity-90">({companyPhone})</span>
            </a>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Take me back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ------------------------------------------------------------------
  // Step 1 -- Tell us why
  // ------------------------------------------------------------------
  const renderStep1 = () => (
    <>
      <NoteBeforeAction tone="info" title="Nothing's cancelled yet">
        You're starting a cancellation -- nothing on the catering side will move
        until you confirm at the end. You can back out at any step.
      </NoteBeforeAction>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-900">
          Why are you {isQuote ? "declining the quote" : "cancelling"}?
        </p>
        <div className="flex flex-wrap gap-2">
          {reasonOptions.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setReasonKey(r.key)}
              className={`text-sm px-3 py-2 rounded-full border transition-colors ${
                reasonKey === r.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Textarea
          placeholder="Add a quick note if you'd like (optional). It helps the catering team improve."
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <p className="text-xs text-slate-500">
          The reason is never required. We just want to know if there's
          something we could have done differently.
        </p>
      </div>
    </>
  );

  // ------------------------------------------------------------------
  // Step 2 -- Here's what happens
  // ------------------------------------------------------------------
  const renderStep2 = () => (
    <>
      <NoteBeforeAction
        tone={hasMoney || isQuote ? "info" : "warning"}
        title={
          isQuote
            ? "Declining means the catering team won't follow up on this quote."
            : `You're ${terms.daysToEvent === 0 ? "cancelling today" : `cancelling ${terms.daysToEvent} day${terms.daysToEvent === 1 ? "" : "s"} out from your event`}.`
        }
      >
        {isQuote
          ? `${companyName} will mark the quote as declined and stop reminders. You can ask for a fresh quote any time.`
          : `Per ${companyName}'s policy: ${terms.windowLabel.toLowerCase()} -- ${terms.tierLabel === "forfeit" ? "no refund is due, but we can still issue store credit as a goodwill gesture." : terms.tierLabel === "full" ? "you're entitled to a full refund." : `${terms.refundPct}% of what you paid is refundable.`}`}
      </NoteBeforeAction>

      {!isQuote && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Paid so far</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {fmtMoney(Math.max(termsInput.amountPaid, termsInput.depositAmount))}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Refundable to your account</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {fmtMoney(terms.refundAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-emerald-700 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Or as store credit
            </span>
            <span className="font-semibold text-emerald-700 tabular-nums">
              {fmtMoney(terms.creditAmount)}
              {terms.creditAmount > terms.refundAmount && (
                <span className="ml-1 text-xs font-normal">
                  (+{fmtMoney(terms.creditAmount - terms.refundAmount)} bonus)
                </span>
              )}
            </span>
          </div>
          <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-sm">
            <span className="text-slate-500">Non-refundable per policy</span>
            <span className="text-slate-700 tabular-nums">
              {fmtMoney(terms.chargeAmount)}
            </span>
          </div>
        </div>
      )}

      {!isQuote && terms.committedCostNote && (
        <NoteBeforeAction tone="warning" title="Committed costs">
          {terms.committedCostNote}
        </NoteBeforeAction>
      )}

      {!isQuote && terms.canPostpone && onPostponeRequest && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CalendarClock className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-900">
              Could you postpone instead?
            </p>
            <p className="text-sm text-emerald-800 mt-1">
              Same deposit, new date. Nothing lost on either side.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            onClick={() => {
              close();
              onPostponeRequest();
            }}
          >
            Switch to postpone
          </Button>
        </div>
      )}

      {!isQuote && terms.requiresOwnerOverride && (
        <NoteBeforeAction
          tone="warning"
          title="This cancellation needs review"
        >
          Because you're inside the late-cancellation window, the catering team
          will need to approve this before any money moves. We'll send your
          request now and they'll respond shortly.
        </NoteBeforeAction>
      )}
    </>
  );

  // ------------------------------------------------------------------
  // Step 3 -- How would you like the difference handled?
  // ------------------------------------------------------------------
  const renderStep3 = () => (
    <>
      <p className="text-sm text-slate-600">
        Your refund and store credit options for this cancellation. Pick one.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Credit card -- listed first as the recommended option */}
        <button
          type="button"
          onClick={() => setPayout("credit")}
          className={`text-left rounded-xl border-2 p-4 transition-all ${
            payout === "credit"
              ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
              : "border-slate-200 bg-white hover:border-emerald-300"
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Recommended
            </Badge>
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {fmtMoney(terms.creditAmount)}
          </p>
          <p className="text-sm font-medium text-slate-900 mt-1">
            Store credit
          </p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Use it on any future booking with {companyName}. Never expires.
            {terms.creditAmount > terms.refundAmount &&
              ` Includes a ${fmtMoney(terms.creditAmount - terms.refundAmount)} goodwill bonus.`}
          </p>
        </button>

        {/* Refund card */}
        <button
          type="button"
          onClick={() => setPayout("refund")}
          disabled={terms.refundAmount === 0}
          className={`text-left rounded-xl border-2 p-4 transition-all ${
            terms.refundAmount === 0
              ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
              : payout === "refund"
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                : "border-slate-200 bg-white hover:border-blue-300"
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            {terms.refundAmount === 0 && (
              <Badge variant="outline" className="text-slate-500">
                Not available
              </Badge>
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {fmtMoney(terms.refundAmount)}
          </p>
          <p className="text-sm font-medium text-slate-900 mt-1">
            Refund to original payment method
          </p>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            {terms.refundAmount === 0
              ? "Per policy, no refund is due for this cancellation."
              : "Arrives within a few business days."}
          </p>
        </button>
      </div>

      <NoteBeforeAction tone="warning" title="When you click Confirm cancellation we will:">
        <ul className="list-disc list-inside space-y-1 mt-1 text-sm">
          <li>mark your order as cancelled</li>
          <li>release the kitchen, drivers and equipment booked for it</li>
          <li>notify the catering team with your reason</li>
          <li>email you a confirmation</li>
          {payout === "credit" && terms.creditAmount > 0 && (
            <li>
              add <strong>{fmtMoney(terms.creditAmount)}</strong> to your store
              credit balance immediately
            </li>
          )}
          {payout === "refund" && terms.refundAmount > 0 && (
            <li>
              process a <strong>{fmtMoney(terms.refundAmount)}</strong> refund
              to your original payment method
            </li>
          )}
          <li>{terms.freedSlotNote}</li>
        </ul>
        <p className="mt-2 text-xs">
          You can't undo this from here -- you'd need to call {companyName}.
        </p>
      </NoteBeforeAction>
    </>
  );

  // ------------------------------------------------------------------
  // Footer wiring
  // ------------------------------------------------------------------
  const finalStep = isQuote ? 2 : hasMoney ? 3 : 2;
  const isFinal = step === finalStep;

  const next = () => {
    if (step === 1) setStep(2);
    else if (step === 2 && !isFinal) setStep(3);
  };
  const prev = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>
              {isQuote ? "Decline this quote" : "Cancel this order"}
            </DialogTitle>
            <Badge variant="outline" className="font-normal">
              Step {step} of {finalStep}
            </Badge>
          </div>
          <DialogDescription>
            {step === 1 && "We'll show you what happens before anything moves."}
            {step === 2 &&
              (isQuote
                ? "Confirm you'd like to decline this quote."
                : "Here's what cancelling now means for you.")}
            {step === 3 && "Pick how you'd like the difference handled."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        {error && (
          <NoteBeforeAction tone="danger" title="Something went wrong">
            {error}
          </NoteBeforeAction>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button
            variant="outline"
            onClick={step === 1 ? close : prev}
            disabled={submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {step === 1 ? "Take me back" : "Back"}
          </Button>

          {!isFinal ? (
            <Button onClick={next} disabled={submitting}>
              {step === 1
                ? "Show me what happens"
                : isQuote
                  ? "Continue"
                  : "Choose payout"}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className={
                isQuote
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  {isQuote ? "Confirm decline" : "Confirm cancellation"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
