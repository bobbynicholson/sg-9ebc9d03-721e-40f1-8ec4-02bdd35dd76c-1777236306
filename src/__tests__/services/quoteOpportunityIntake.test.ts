jest.mock("@/services/quoteDiaryService", () => ({ loadQuoteDiary: jest.fn(async () => []) }));
import { loadQuoteOptimizationData } from "@/services/quoteOptimizationService";
import { loadQuoteDiary } from "@/services/quoteDiaryService";

function database(records: Record<string, any[]>) {
  const calls: any[] = [];
  return { calls, from(table: string) {
    const call: any = { table, filters: [] }; calls.push(call);
    let rows = [...(records[table] || [])];
    const query: any = {
      select: () => query,
      eq(field: string, value: unknown) { call.filters.push([field, value]); rows = rows.filter((row) => row[field] === value); return query; },
      is(field: string, value: unknown) { rows = rows.filter((row) => (row[field] ?? null) === value); return query; },
      in(field: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[field])); return query; },
      or(filter: string) { const match = filter.match(/gte\.([\d-]+),event_date.lte\.([\d-]+)/)!; rows = rows.filter((row) => !row.event_date || row.event_date >= match[1] && row.event_date <= match[2]); return query; },
      gte(field: string, value: string) { rows = rows.filter((row) => row[field] >= value); return query; },
      lte(field: string, value: string) { rows = rows.filter((row) => row[field] <= value); return query; },
      order(field: string, options = { ascending: true }) { rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (options.ascending === false ? -1 : 1)); return query; },
      limit(value: number) { rows = rows.slice(0, value); return query; },
      maybeSingle: async () => ({ data: table === "companies" ? { dispatch_settings: {} } : rows[0] || null, error: null }),
      range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
    };
    return query;
  } };
}
const lead = (id: string, changes = {}) => ({ id, company_id: "tenant", status: "new", event_date: "2026-11-14", ...changes });
const quote = (id: string, changes = {}) => ({ id, company_id: "tenant", event_date: "2026-11-14", status: "draft", menu_items: [], ...changes });
const order = (id: string, changes = {}) => ({ id, company_id: "tenant", event_date: "2026-11-14", status: "confirmed", ...changes });
beforeEach(() => { (loadQuoteDiary as jest.Mock).mockResolvedValue([]); });

test("loads every quote lifecycle state, raw submissions and undated enquiries within tenant scope", async () => {
  const db = database({ leads: [lead("dated"), lead("undated", { event_date: null }), lead("foreign", { company_id: "other" })],
    quotes: ["draft", "sent", "accepted", "expired", "rejected"].map((status) => quote(status, { status })) });
  const data = await loadQuoteOptimizationData(db, "tenant", "2026-11-10", "2026-12-10");
  expect(data.leads.map((row) => row.id).sort()).toEqual(["dated", "undated"]);
  expect(data.quotes).toHaveLength(5);
  for (const call of db.calls) expect(call.filters).toContainEqual([call.table === "companies" ? "id" : "company_id", "tenant"]);
});
test("All upcoming includes opportunities beyond ninety days", async () => {
  const db = database({ leads: [lead("future", { event_date: "2028-05-20" }), lead("undated", { event_date: null })] });
  const data = await loadQuoteOptimizationData(db, "tenant", "2026-11-10", "all");
  expect(data.end).toBe("2028-05-20"); expect(data.allUpcoming).toBe(true); expect(data.leads).toHaveLength(2);
});
test("pending orders stay visible but only confirmed bookings consume accepted capacity", async () => {
  const orders = [order("confirmed"), order("pending", { status: "pending" }), order("draft", { status: "draft" })];
  (loadQuoteDiary as jest.Mock).mockResolvedValue(orders.map((row) => ({ kind: "order", sourceId: row.id, date: row.event_date })));
  const data = await loadQuoteOptimizationData(database({ orders }), "tenant", "2026-11-10", "2026-12-10");
  expect(data.orders).toHaveLength(3); expect(data.commitments.map((entry) => entry.sourceId)).toEqual(["confirmed"]);
});
test("resolves a lead's moved quote and order outside the visible window without recreating an old-date opportunity", async () => {
  const db = database({ leads: [lead("lead")], quotes: [quote("q", { lead_id: "lead", status: "accepted", event_date: "2027-02-01", converted_to_order_id: "o" })],
    orders: [order("o", { quote_id: "q", event_date: "2027-02-01" })] });
  const data = await loadQuoteOptimizationData(db, "tenant", "2026-11-10", "2026-12-10");
  expect(data.quotes).toHaveLength(0); expect(data.relatedQuotes.map((row) => row.id)).toEqual(["q"]); expect(data.orders.map((row) => row.id)).toEqual(["o"]);
});
