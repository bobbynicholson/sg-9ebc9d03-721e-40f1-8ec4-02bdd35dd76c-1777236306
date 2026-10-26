import { resolveInvoiceFirstPaymentAmount } from "@/lib/invoiceClientView";

type PaymentAmountSource = number | string | null | undefined;

export interface DepositReminderAmountInput {
  depositPaid?: boolean | null;
  orderTotalAmount?: PaymentAmountSource;
  orderAmountPaid?: PaymentAmountSource;
  orderDepositAmount?: PaymentAmountSource;
  orderDepositPercent?: PaymentAmountSource;
  invoiceTotalAmount?: PaymentAmountSource;
  invoiceAmountPaid?: PaymentAmountSource;
  invoiceBalanceDue?: PaymentAmountSource;
  snapshotFirstPaymentAmount?: PaymentAmountSource;
  companyDepositPercent?: PaymentAmountSource;
}

function money(value: PaymentAmountSource): number {
  if (value == null || value === "") return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

/**
 * Return only the amount still needed to satisfy the agreed first payment.
 * Order and invoice paid totals are both considered because imported and
 * legacy records can have one projection ahead of the other.
 */
export function outstandingDepositReminderAmount(input: DepositReminderAmountInput): number {
  if (input.depositPaid === true) return 0;

  const totalAmount = money(input.invoiceTotalAmount) || money(input.orderTotalAmount);
  if (totalAmount <= 0) return 0;

  const agreedDeposit = resolveInvoiceFirstPaymentAmount({
    totalAmount,
    orderDepositAmount: input.orderDepositAmount,
    snapshotFirstPaymentAmount: input.snapshotFirstPaymentAmount,
    orderDepositPercent: input.orderDepositPercent,
    companyDepositPercent: input.companyDepositPercent,
    defaultDepositPercent: 50,
  });
  if (agreedDeposit <= 0) return 0;

  const paidToDate = Math.max(money(input.orderAmountPaid), money(input.invoiceAmountPaid));
  const remainingDeposit = Math.max(0, agreedDeposit - paidToDate);
  if (remainingDeposit < 0.01) return 0;

  const rawInvoiceBalance = input.invoiceBalanceDue;
  const invoiceBalance = rawInvoiceBalance == null || rawInvoiceBalance === ""
    ? Math.max(0, totalAmount - paidToDate)
    : money(rawInvoiceBalance);

  return Math.round(Math.min(remainingDeposit, invoiceBalance) * 100) / 100;
}
