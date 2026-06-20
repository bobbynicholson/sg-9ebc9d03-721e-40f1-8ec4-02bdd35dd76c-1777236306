/**
 * A real, human-facing name for an order in kitchen / ops / list headers.
 *
 * The quote builder stores the LITERAL string "Untitled" as quote_name /
 * event_name when the operator didn't type an event title
 * (admin/quotes/new.tsx: `quote_name: eventName.trim() || "Untitled"`).
 * Because "Untitled" is a non-empty string, the common `event_name ||
 * client_name` fallback never fires - so kitchen cards, prep lists and
 * dashboards all render "Untitled" instead of telling the chef who the
 * order is for.
 *
 * This treats an empty OR "Untitled" event name as missing and falls back
 * to the client's name, then the order number. Use it anywhere an order
 * is labelled for a human.
 */
export function orderDisplayName(o: {
  event_name?: string | null;
  client_name?: string | null;
  order_number?: string | null;
}): string {
  const ev = (o.event_name || "").trim();
  if (ev && !/^untitled$/i.test(ev)) return ev;
  const client = (o.client_name || "").trim();
  if (client) return client;
  const num = (o.order_number || "").trim();
  return num ? `Order ${num}` : "Order";
}
