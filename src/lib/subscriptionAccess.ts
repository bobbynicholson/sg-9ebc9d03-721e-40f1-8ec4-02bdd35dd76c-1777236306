/**
 * Subscription route state must come from the company record. The expired
 * query parameter is only a hint from middleware and may outlive a successful
 * PayFast notification or be present on an old bookmark.
 */
export function hasSubscriptionAccess(
  status: string | null | undefined,
  trialEndsAt?: string | null,
  now = Date.now(),
): boolean {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "active" || normalizedStatus === "past_due") return true;
  if (normalizedStatus !== "trial" || !trialEndsAt) return normalizedStatus === "trial";
  const trialEnd = new Date(trialEndsAt).getTime();
  return !Number.isFinite(trialEnd) || trialEnd > now;
}

export function shouldShowExpiredSubscriptionPage(
  status: string | null | undefined,
  trialEndsAt: string | null | undefined,
  expiredHint: boolean,
  now = Date.now(),
): boolean {
  if (hasSubscriptionAccess(status, trialEndsAt, now)) return false;

  const normalizedStatus = String(status || "").toLowerCase();
  return expiredHint
    || normalizedStatus === "suspended"
    || normalizedStatus === "cancelled"
    || (normalizedStatus === "trial"
      && !!trialEndsAt
      && Number.isFinite(new Date(trialEndsAt).getTime())
      && new Date(trialEndsAt).getTime() <= now);
}
