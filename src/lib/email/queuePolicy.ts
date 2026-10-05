/** Operational mail is independent of a company's marketing follow-up opt-in. */
export const TRANSACTIONAL_EMAIL_EVENTS = [
  "quote", "quote.sent", "order", "order.created", "order.confirmed",
  "pre_event", "kitchen_pre_event", "event_tomorrow_admin_email",
  "event_tomorrow_kitchen_email", "event_shopping_lead_email",
] as const;

export function queuedEmailReference(event: string, id?: string | null) {
  if (!id) return {};
  if (event === "quote" || event.startsWith("quote.")) return { quoteId: id };
  if (event === "order" || event.startsWith("order.") || TRANSACTIONAL_EMAIL_EVENTS.includes(event as typeof TRANSACTIONAL_EMAIL_EVENTS[number])) return { orderId: id };
  return {};
}
