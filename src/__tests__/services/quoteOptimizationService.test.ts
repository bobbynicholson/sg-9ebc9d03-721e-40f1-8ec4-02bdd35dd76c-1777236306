jest.mock("@/services/quoteDiaryService", () => ({ loadQuoteDiary: jest.fn(async () => []) }));
import { loadQuoteOptimizationData } from "@/services/quoteOptimizationService";
import { loadQuoteDiary } from "@/services/quoteDiaryService";

function database(fail = false) {
  const calls: any[] = [];
  return { calls, from(table: string) {
    const call: any = { table, filters: [] }; calls.push(call);
    const query: any = {
      select: (fields: string) => { call.select = fields; return query; },
      eq: (field: string, value: unknown) => { call.filters.push(["eq", field, value]); return query; },
      is: (field: string, value: unknown) => { call.filters.push(["is", field, value]); return query; },
      in: (field: string, values: unknown[]) => { call.filters.push(["in", field, values]); return query; },
      or: (filter: string) => { call.filters.push(["or", filter]); return query; },
      gte: () => query, lte: () => query, order: () => query,
      maybeSingle: async () => ({ data: { dispatch_settings: { maxConcurrentEvents: 4 } }, error: null }),
      range: async (start: number, end: number) => {
        call.range = [start, end];
        return { data: table === "quotes" ? Array.from({ length: Math.max(0, Math.min(end + 1, 501) - start) }, (_, index) => ({ id: `quote-${start + index}`, menu_items: [] })) : [], error: fail ? new Error("Read failed") : null };
      },
    };
    return query;
  } };
}
test("loads beyond the normal quotes-page cap and scopes every read to the company", async () => {
  const db = database();
  const data = await loadQuoteOptimizationData(db, "tenant", "2026-11-10", "2026-11-20");
  expect(data.quotes).toHaveLength(501);
  expect(db.calls.filter((call) => call.table === "quotes").map((call) => call.range)).toEqual([[0, 499], [500, 999]]);
  for (const call of db.calls) expect(call.filters).toContainEqual(["eq", call.table === "companies" ? "id" : "company_id", "tenant"]);
  expect(db.calls[0].filters).toContainEqual(["or", "event_date.is.null,and(event_date.gte.2026-11-10,event_date.lte.2026-11-20)"]);
});
test("the diary covers complete weeks around the selected date range", async () => {
  const db = database();
  await loadQuoteOptimizationData(db, "tenant", "2026-11-10", "2026-11-20");
  expect(loadQuoteDiary).toHaveBeenLastCalledWith(db, "tenant", "2026-11-09", "2026-11-22");
});
test("read errors cannot masquerade as a free schedule or empty pipeline", async () => {
  await expect(loadQuoteOptimizationData(database(true), "tenant", "2026-11-10", "2026-11-20")).rejects.toThrow("Read failed");
  await expect(loadQuoteOptimizationData(database(), "", "2026-11-10", "2026-11-20")).rejects.toThrow("company is required");
});
