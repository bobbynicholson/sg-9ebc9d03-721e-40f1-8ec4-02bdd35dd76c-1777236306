export const OPEN_REFUND_STATUSES = ["pending", "processing", "failed"] as const;

export function isOpenRefundStatus(status: unknown): boolean {
  return OPEN_REFUND_STATUSES.includes(String(status || "") as typeof OPEN_REFUND_STATUSES[number]);
}
