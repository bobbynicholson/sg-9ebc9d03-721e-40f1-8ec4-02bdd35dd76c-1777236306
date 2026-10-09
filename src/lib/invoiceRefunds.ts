export function refundableExcessAmount(
  amountPaid: number,
  revisedInvoiceTotal: number,
  openRefundAmount: number,
): number {
  return Number(Math.max(
    0,
    Number(amountPaid || 0) - Number(revisedInvoiceTotal || 0) - Number(openRefundAmount || 0),
  ).toFixed(2));
}