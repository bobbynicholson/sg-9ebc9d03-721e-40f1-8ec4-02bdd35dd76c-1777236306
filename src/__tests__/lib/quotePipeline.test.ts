import type { Quote } from "@/types";
import { buildQuotePipeline, pipelineCapacity, summarizePipelineDay, type PlanningLead, type PlanningOrder } from "@/lib/quotes/quotePipeline";
import type { Opportunity } from "@/lib/quotes/quoteOptimization";
const date = "2026-11-14";
const lead = (id: string, changes = {}): PlanningLead => ({ id, client_name: `Client ${id}`, contact_name: `Client ${id}`,
  client_email: `${id}@example.test`, event_date: date, guest_count: 50, status: "new", source: "embed", ...changes } as PlanningLead);
const quote = (id: string, changes = {}): Quote => ({ id, quote_number: `Q-${id}`, client_name: `Client ${id}`, client_email: `${id}@example.test`,
  event_date: date, guest_count: 50, subtotal: 1000, currency: "ZAR", status: "sent", ...changes } as Quote);
const order = (id: string, changes = {}): PlanningOrder => ({ id, client_name: `Client ${id}`, client_id: id, event_date: date, guest_count: 50, status: "confirmed", ...changes } as PlanningOrder);
const build = (changes: Partial<Parameters<typeof buildQuotePipeline>[0]>) => buildQuotePipeline({ leads: [], quotes: [], orders: [], commitments: [], opportunities: [], start: "2026-11-10", end: "2026-12-10", currency: "ZAR", ...changes });

test("an unquoted website submission is visible for review without inventing profitability", () => {
  const rows = build({ leads: [lead("a", { budget: 9999 })] });
  expect(rows).toHaveLength(1); expect(rows[0].state).toBe("review"); expect(rows[0].quotes).toHaveLength(0);
  expect(summarizePipelineDay(rows, date)).toMatchObject({ accepted: 0, awaitingDecision: 1, review: 1 });
});
test("a form lead and its automatically generated draft count as one enquiry", () => {
  const rows = build({ leads: [lead("a")], quotes: [quote("draft", { lead_id: "a", status: "draft" })] });
  expect(rows).toHaveLength(1); expect(rows[0].leads).toHaveLength(1); expect(rows[0].quotes).toHaveLength(1);
  expect(rows[0].reasons).toContain("Draft quote needs staff review before sending.");
});
test("lead, quote and accepted order form one accepted opportunity", () => {
  const rows = build({ leads: [lead("a")], quotes: [quote("q", { lead_id: "a", status: "accepted", converted_to_order_id: "o" })],
    orders: [order("o", { quote_id: "q" })] });
  expect(rows).toHaveLength(1); expect(rows[0].state).toBe("accepted"); expect(rows[0].leads[0].id).toBe("a");
});
test("multiple quote options remain accessible without inflating enquiry counts", () => {
  const rows = build({ leads: [lead("a")], quotes: [quote("q1", { lead_id: "a" }), quote("q2", { lead_id: "a" })],
    opportunities: [{ id: "q1" }, { id: "q2" }] as Opportunity[] });
  expect(rows).toHaveLength(1); expect(rows[0].quotes).toHaveLength(2); expect(rows[0].state).toBe("pending");
});
test("undated and incomplete records stay visible in a separate review queue", () => {
  const rows = build({ leads: [lead("a", { event_date: null, guest_count: null })], quotes: [quote("q", { event_date: null, lead_id: "a", subtotal: 0, guest_count: null })] });
  expect(rows).toHaveLength(1); expect(rows[0].date).toBeNull(); expect(rows[0].state).toBe("review");
  expect(rows[0].reasons).toEqual(expect.arrayContaining(["Event date is missing.", "Guest count is missing.", "Quote pricing needs to be completed."]));
});
test("pending orders and leads marked won do not masquerade as accepted bookings", () => {
  const rows = build({ leads: [lead("a", { status: "won" })], orders: [order("pending", { status: "pending" })] });
  expect(summarizePipelineDay(rows, date)).toMatchObject({ accepted: 0, review: 2 });
});
test("accepted quote without an order counts once when the diary verifies it", () => {
  const rows = build({ quotes: [quote("accepted", { status: "accepted" })], commitments: [{ kind: "accepted_quote", date, sourceId: "accepted", label: "Client", guests: 50 }] });
  expect(summarizePipelineDay(rows, date).accepted).toBe(1);
});
test("accepted quote bookings remain visible across regions", () => {
  const rows = build({ quotes: [quote("accepted", { status: "accepted", region_id: "other-region" })],
    commitments: [{ kind: "accepted_quote", date, sourceId: "accepted", label: "Client", guests: 50 }], regionId: "selected-region" });
  expect(rows).toHaveLength(1); expect(rows[0].state).toBe("accepted");
});
test("cancelled converted bookings remain closed and do not resurrect their old lead", () => {
  const rows = build({ leads: [lead("a")], quotes: [quote("q", { lead_id: "a", status: "accepted", converted_to_order_id: "o" })], orders: [order("o", { quote_id: "q", status: "cancelled" })] });
  expect(rows).toHaveLength(1); expect(rows[0].state).toBe("closed");
});
test("a moved order owns the date; its stale lead and quote do not create old-date demand", () => {
  const rows = build({ leads: [lead("a")], quotes: [quote("q", { lead_id: "a", status: "accepted", converted_to_order_id: "o" })], orders: [order("o", { quote_id: "q", event_date: "2027-01-01" })] });
  expect(rows).toHaveLength(0);
});
test("suspected duplicate submissions are flagged instead of silently deleted", () => {
  const rows = build({ leads: [lead("a"), lead("b", { client_email: "A@EXAMPLE.TEST" })] });
  expect(rows).toHaveLength(2); expect(rows[0].duplicateGroup).toBe(rows[1].duplicateGroup);
  expect(rows[0].duplicatePeers).toHaveLength(1);
});
test("separate accepted orders occupy two slots even if flagged as duplicates", () => {
  const rows = build({ orders: [order("a", { client_email: "same@example.test" }), order("b", { client_email: "same@example.test" })] });
  const day = summarizePipelineDay(rows, date);
  expect(day.accepted).toBe(2); expect(rows[0].duplicateGroup).toBeTruthy();
  expect(pipelineCapacity(day, [{ kind: "order", date, label: "a", guests: 50 }, { kind: "order", date, label: "b", guests: 50 }],
    { maxConcurrentEvents: 5, maxKitchenLoadPerDay: 300, maxGuestsPerEvent: 200 })).toMatchObject({ remainingEvents: 3, remainingGuests: 200 });
});
test("same contact on different dates is not flagged as a duplicate", () => {
  const rows = build({ leads: [lead("a"), lead("b", { client_email: "a@example.test", event_date: "2026-11-15" })] });
  expect(rows.every((row) => !row.duplicateGroup)).toBe(true);
});
test("remaining capacity stays company-wide when the enquiry board is region-filtered", () => {
  expect(pipelineCapacity(summarizePipelineDay([], date), [{ kind: "order", date, label: "Other region", guests: 100 }],
    { maxConcurrentEvents: 3, maxKitchenLoadPerDay: 300, maxGuestsPerEvent: 200 })).toMatchObject({ remainingEvents: 2, remainingGuests: 200 });
});
test("unknown booked guests never imply known remaining kitchen capacity", () => {
  expect(pipelineCapacity(summarizePipelineDay([], date), [{ kind: "order", date, label: "Incomplete", guests: null }],
    { maxConcurrentEvents: 3, maxKitchenLoadPerDay: 300, maxGuestsPerEvent: 200 }).remainingGuests).toBeNull();
});
