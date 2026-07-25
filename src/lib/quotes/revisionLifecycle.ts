export type QuotePricingMode = "per_person" | "per_portion" | "flat";

export function savedQuantityWasOverridden(
  pricingMode: QuotePricingMode,
  savedQuantity: number,
  guestCount: number,
): boolean {
  return (
    pricingMode === "per_person"
    && Number.isFinite(savedQuantity)
    && savedQuantity > 0
    && savedQuantity !== guestCount
  );
}

export function buildQuoteSentLifecyclePatch(input: {
  isConverted?: boolean;
  contentChanged?: boolean;
  sentAt: string;
}): Record<string, string | null> {
  const patch: Record<string, string | null> = {
    sent_at: input.sentAt,
  };

  if (!input.isConverted) {
    patch.status = "sent";
    if (input.contentChanged === true) {
      patch.accepted_at = null;
      patch.viewed_at = null;
      patch.rejected_at = null;
    }
  }

  return patch;
}

export function buildQuoteChangeEditorPath(
  quoteId: string,
  changeRequestId: string,
): string {
  return `/admin/quotes/new?fromQuoteId=${encodeURIComponent(quoteId)}&change_request_id=${encodeURIComponent(changeRequestId)}`;
}
