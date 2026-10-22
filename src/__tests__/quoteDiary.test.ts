import { buildDiaryEntries, buildDiaryIndex, computeDiarySignal, toDateKey } from "@/lib/quoteDiarySignal";
import { loadQuoteDiary, quoteDiaryRange } from "@/services/quoteDiaryService";

const date = "2026-12-11";
const company = "caterer";
const order = (id: string, changes = {}) => ({ id: `order-${id}`, quote_id: `quote-${id}`, company_id: company, event_date: date, client_name: `Customer ${id}`, guest_count: 100, status: "confirmed", deleted_at: null, ...changes });
const quote = (id: string, changes = {}) => ({ id: `quote-${id}`, converted_to_order_id: `order-${id}`, company_id: company, event_date: date, client_name: `Customer ${id}`, guest_count: 100, status: "accepted", deleted_at: null, ...changes });

// Honor the actual selects, filters and page ranges. A missing lifecycle
// column or tenant condition must not be hidden by the query mock.
function database(orders: any[], quotes: any[], failTable?: string) {
  const calls: any[] = [];
  return { calls, from(table: string) {
    const call: any = { table, filters: [] }; calls.push(call);
    let rows = [...(table === "orders" ? orders : quotes)];
    let columns: string[] = [];
    const query: any = {
      select(fields: string) { columns = fields.split(",").map((field) => field.trim()); return query; },
      eq(field: string, value: any) { call.filters.push(["eq", field, value]); rows = rows.filter((row) => row[field] === value); return query; },
      is(field: string, value: any) { call.filters.push(["is", field, value]); rows = rows.filter((row) => row[field] === value); return query; },
      in(field: string, values: any[]) { call.filters.push(["in", field, values]); rows = rows.filter((row) => values.includes(row[field])); return query; },
      gte(field: string, value: string) { rows = rows.filter((row) => row[field] >= value); return query; },
      lte(field: string, value: string) { rows = rows.filter((row) => row[field] <= value); return query; },
      order(field: string) { rows.sort((a, b) => String(a[field]).localeCompare(String(b[field]))); return query; },
      async range(start: number, end: number) {
        call.range = [start, end];
        return { data: failTable === table ? null : rows.slice(start, end + 1).map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))), error: failTable === table ? new Error("Diary unavailable") : null };
      },
    };
    return query;
  } };
}

test("four confirmed orders and their four accepted quotes display four, including the current booking", async () => {
  const db = database([1, 2, 3, 4].map((id) => order(String(id))), [1, 2, 3, 4].map((id) => quote(String(id))));
  const entries = await loadQuoteDiary(db, company, date, date);
  const signal = computeDiarySignal(date, buildDiaryIndex(entries), "quote-1");
  expect(signal.sameDay).toHaveLength(4);
  expect(signal.headline).toBe("4 bookings that day");
  expect(signal.detail).toContain("Includes this booking.");
  expect(signal.detail).toContain("+1 more");
  expect(signal.sweetenerWorthwhile).toBe(false);
});

test("a prospective quote sees the same whole-day total without claiming it is already booked", async () => {
  const entries = await loadQuoteDiary(database([order("1"), order("2")], [quote("1"), quote("2")]), company, date, date);
  const signal = computeDiarySignal(date, buildDiaryIndex(entries), "unaccepted-quote");
  expect(signal.headline).toBe("2 bookings that day");
  expect(signal.detail).not.toContain("Includes this booking");
});

test("accepted quotes with no order reserve one slot, but open quotes do not", async () => {
  const entries = await loadQuoteDiary(database([], [quote("1", { converted_to_order_id: null }), quote("2", { status: "sent", converted_to_order_id: null })]), company, date, date);
  expect(entries).toHaveLength(1);
  expect(computeDiarySignal(date, buildDiaryIndex(entries), "quote-1").detail).toContain("This booking:");
});

test.each(["cancelled", "canceled", "draft"])("%s orders and their accepted quotes do not occupy diary slots", async (status) => {
  const entries = await loadQuoteDiary(database([order("1", { status })], [quote("1")]), company, date, date);
  expect(entries).toEqual([]);
});

test("deleted orders and quotes are excluded without resurrecting their converted quote", async () => {
  const entries = await loadQuoteDiary(database([order("1", { deleted_at: "2026-10-22" })], [quote("1"), quote("2", { converted_to_order_id: null, deleted_at: "2026-10-22" })]), company, date, date);
  expect(entries).toEqual([]);
});

test("a postponed order owns the booking date; its accepted quote does not leave a ghost on the original day", async () => {
  const entries = await loadQuoteDiary(database([order("1", { event_date: "2026-12-12" })], [quote("1")]), company, "2026-12-10", "2026-12-13");
  const index = buildDiaryIndex(entries);
  expect(computeDiarySignal(date, index).sameDay).toHaveLength(0);
  expect(computeDiarySignal("2026-12-12", index).sameDay).toHaveLength(1);
  expect(computeDiarySignal(date, index).nearby).toHaveLength(1);
});

test.each([
  { event_date: "2027-01-01" },
  { status: "cancelled" },
  { deleted_at: "2026-10-22" },
])("legacy reverse-only conversion does not resurrect an old quote: %j", async (changes) => {
  const entries = await loadQuoteDiary(database([order("1", changes)], [quote("1", { converted_to_order_id: null })]), company, date, date);
  expect(entries).toHaveLength(0);
});

test("reverse-only conversion on an active order still counts just once", async () => {
  const entries = await loadQuoteDiary(database([order("1")], [quote("1", { converted_to_order_id: null })]), company, date, date);
  expect(entries).toHaveLength(1);
});

test("two genuine bookings by the same customer stay separate", async () => {
  const entries = await loadQuoteDiary(database([order("1", { client_name: "Same Customer" }), order("2", { client_name: "Same Customer" })], [quote("1"), quote("2")]), company, date, date);
  expect(computeDiarySignal(date, buildDiaryIndex(entries)).sameDay).toHaveLength(2);
});

test("every query is tenant scoped, including a reverse-link search", async () => {
  const db = database([order("foreign", { company_id: "another-caterer", quote_id: "quote-1" })], [quote("1", { converted_to_order_id: null }), quote("foreign", { company_id: "another-caterer" })]);
  expect(await loadQuoteDiary(db, company, date, date)).toHaveLength(1);
  expect(db.calls).toHaveLength(3);
  for (const call of db.calls) expect(call.filters).toContainEqual(["eq", "company_id", company]);
});

test("the diary reads beyond the API page limit", async () => {
  const orders = Array.from({ length: 1003 }, (_, i) => order(String(i)));
  const entries = await loadQuoteDiary(database(orders, []), company, date, date);
  expect(entries).toHaveLength(1003);
});

test.each(["orders", "quotes"])("a failed %s query never advertises an empty diary", async (table) => {
  await expect(loadQuoteDiary(database([], [], table), company, date, date)).rejects.toThrow("Diary unavailable");
  expect(computeDiarySignal(date, null)).toMatchObject({ status: "unknown", sweetenerWorthwhile: false, headline: "Diary count unavailable" });
});

test("nearby counts also deduplicate converted bookings", () => {
  const entries = buildDiaryEntries([order("1", { event_date: "2026-12-12" })], [quote("1", { event_date: "2026-12-12" })]);
  const signal = computeDiarySignal(date, buildDiaryIndex(entries));
  expect(signal.sameDay).toHaveLength(0);
  expect(signal.nearby).toHaveLength(1);
  expect(signal.sweetenerWorthwhile).toBe(true);
});

test("duplicate source rows do not inflate the index", () => {
  const entries = buildDiaryEntries([order("1"), order("1")], []);
  expect(computeDiarySignal(date, buildDiaryIndex(entries)).sameDay).toHaveLength(1);
});

test("calendar dates remain calendar dates, including in a western browser timezone", () => {
  expect(toDateKey("2026-12-11")).toBe("2026-12-11");
  expect(toDateKey("2026-02-31")).toBeNull();
  expect(toDateKey("invalid")).toBeNull();
});

test("range covers past and future quote dates plus both nearby-day boundaries", () => {
  expect(quoteDiaryRange(["2025-01-01", "2027-01-01", null], new Date("2026-10-22T12:00:00"))).toEqual({ start: "2024-12-30", end: "2027-01-03" });
});
