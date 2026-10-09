import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { DocumentAmountChangeSummary } from "@/services/documentAmountChanges";

export function AmountChangeAction({
  change,
  href,
  formatAmount,
  actionLabel: requestedActionLabel,
  settled = false,
}: {
  change: DocumentAmountChangeSummary | null | undefined;
  href: string;
  formatAmount: (amount: number) => string;
  actionLabel?: string;
  settled?: boolean;
}) {
  if (!change) return null;
  const increased = change.direction === "increase";
  const isSettled = settled || change.refundPaymentStatus === "completed";
  const Icon = increased ? ArrowUpRight : ArrowDownRight;
  const actionLabel = isSettled
    ? increased ? "Paid in full" : "Refund paid"
    : requestedActionLabel || (change.kind === "refund"
    ? "Review refund"
    : increased
    ? change.invoiceId ? "Collect balance" : "Review order"
    : change.refundPaymentId ? "Review refund" : "Queue refund");
  const statusLabel = change.kind === "refund" ? "Refund queued" : increased ? "Increased" : "Decreased";
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{statusLabel} {formatAmount(Math.abs(change.changeAmount))}</span>
      <span className="shrink-0 underline underline-offset-2">{actionLabel}</span>
    </>
  );
  const className = `inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border px-2 py-1 text-left text-[11px] font-semibold ${
    isSettled
      ? "border-slate-200 bg-slate-50 text-slate-500 opacity-60 grayscale cursor-default"
      : increased
        ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
        : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
  }`;
  const title = `${change.reason} Previous ${formatAmount(change.previousTotal)}; now ${formatAmount(change.newTotal)}.${isSettled ? ` ${actionLabel}.` : ""}`;

  if (isSettled) {
    return (
      <span
        role="status"
        aria-label={`${statusLabel} ${formatAmount(Math.abs(change.changeAmount))}. ${actionLabel}.`}
        title={title}
        className={className}
      >
        {content}
      </span>
    );
  }
  return (
    <Link
      href={href}
      title={title}
      className={className}
    >
      {content}
    </Link>
  );
}
