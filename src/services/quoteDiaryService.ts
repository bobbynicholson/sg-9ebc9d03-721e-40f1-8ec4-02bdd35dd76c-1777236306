import { buildDiaryEntries, toDateKey, type DiaryEntry, type DiaryOrderRow, type DiaryQuoteRow } from "@/lib/quoteDiarySignal";

const PAGE_SIZE = 500;

async function readPages<T>(query: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await query().order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) return rows;
  }
}

/** Company-wide diary: search, quote buckets and ownership filters must
 *  never hide another booking from a salesperson checking availability. */
export async function loadQuoteDiary(
  db: any,
  companyId: string,
  startDate: string,
  endDate: string,
): Promise<DiaryEntry[]> {
  if (!companyId) throw new Error("A company is required to load the diary.");
  const orderFields = "id, quote_id, event_date, client_name, guest_count, status, deleted_at";
  const [orders, quotes] = await Promise.all([
    readPages<DiaryOrderRow>(() => db.from("orders").select(orderFields)
      .eq("company_id", companyId).is("deleted_at", null).gte("event_date", startDate).lte("event_date", endDate)),
    readPages<DiaryQuoteRow>(() => db.from("quotes")
      .select("id, converted_to_order_id, event_date, client_name, guest_count, status, deleted_at")
      .eq("company_id", companyId).eq("status", "accepted").is("deleted_at", null)
      .gte("event_date", startDate).lte("event_date", endDate)),
  ]);

  // Legacy conversions sometimes set only orders.quote_id. Find that
  // reverse link even if the order moved outside this window or was
  // cancelled/deleted; its old accepted quote must not reappear.
  const knownQuotes = new Set(orders.map((order) => order.quote_id));
  const unresolvedIds = quotes.filter((quote) => !quote.converted_to_order_id && !knownQuotes.has(quote.id)).map((quote) => quote.id);
  const linkedOrders: DiaryOrderRow[] = [];
  for (let offset = 0; offset < unresolvedIds.length; offset += 100) {
    linkedOrders.push(...await readPages<DiaryOrderRow>(() => db.from("orders").select(orderFields)
      .eq("company_id", companyId).in("quote_id", unresolvedIds.slice(offset, offset + 100))));
  }
  return buildDiaryEntries([...orders, ...linkedOrders], quotes).filter((entry) => entry.date >= startDate && entry.date <= endDate);
}

/** Include all displayed quotes (also historical ones) and the nearby
 *  days used by the availability signal. */
export function quoteDiaryRange(eventDates: (string | null | undefined)[], today = new Date()): { start: string; end: string } {
  const keys = eventDates.map(toDateKey).filter((key): key is string => !!key);
  keys.push(toDateKey(today)!);
  keys.sort();
  const shift = (key: string, days: number) => {
    const date = new Date(`${key}T12:00:00`);
    date.setDate(date.getDate() + days);
    return toDateKey(date)!;
  };
  return { start: shift(keys[0], -2), end: shift(keys[keys.length - 1], 2) };
}
