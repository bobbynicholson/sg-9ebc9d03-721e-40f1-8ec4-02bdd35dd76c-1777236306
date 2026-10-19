/**
 * Whether the client should hear about a quote that has just expired
 * (portal notification + "your quote expired" email from
 * /api/cron/expire-stale-quotes).
 *
 *   - draft          -> no. Drafts are internal; the client never saw it.
 *   - sent, imported -> only if it was sent from this app after the
 *                       import (sent_at set). An old quote brought in from
 *                       a spreadsheet was never sent by us, so an expiry
 *                       email about it would come out of nowhere.
 *   - sent           -> yes.
 *
 * The admin digest is unaffected: admins still see every expired quote.
 */
export interface QuoteExpiryEligibilityInput {
  status: string | null | undefined;
  imported_at?: string | null;
  sent_at?: string | null;
}

export function isClientEligibleForExpiry(row: QuoteExpiryEligibilityInput): boolean {
  if (row.status !== "sent") return false;
  if (row.imported_at && !row.sent_at) return false;
  return true;
}
