/**
 * Quote value total for the Quotes page "Total value" tile.
 *
 * Caterers often send a client two options for the same event (they will
 * accept only one), so adding both overstates the value. Rule:
 *   - Quotes for the same client and the same event date: only the
 *     smallest counts.
 *   - Quotes for different dates, or with no event date, all count.
 * The client is the linked client record, else their email, else name.
 */
export interface QuoteForValueTotal {
  total?: number | string | null;
  event_date?: string | null;
  client_id?: string | null;
  client_email?: string | null;
  client_name?: string | null;
}

function clientKey(q: QuoteForValueTotal): string | null {
  if (q.client_id) return `id:${q.client_id}`;
  const email = String(q.client_email || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(q.client_name || "").trim().toLowerCase();
  return name ? `name:${name}` : null;
}

export function quoteValueTotal(quotes: QuoteForValueTotal[]): number {
  const smallestPerClientDate = new Map<string, number>();
  let total = 0;
  for (const q of quotes) {
    const amount = Number(q.total ?? 0);
    const value = Number.isFinite(amount) ? amount : 0;
    const client = clientKey(q);
    const date = String(q.event_date || "").slice(0, 10);
    if (!client || !date) {
      total += value;
      continue;
    }
    const key = `${client}|${date}`;
    const current = smallestPerClientDate.get(key);
    if (current === undefined || value < current) smallestPerClientDate.set(key, value);
  }
  for (const value of smallestPerClientDate.values()) total += value;
  return total;
}
