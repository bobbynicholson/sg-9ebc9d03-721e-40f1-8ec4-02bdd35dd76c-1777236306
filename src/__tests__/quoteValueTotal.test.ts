import { quoteValueTotal } from "@/lib/quotes/quoteValueTotal";

describe("Quotes page Total value", () => {
  it("counts only the smallest of a client's quotes for the same event date", () => {
    expect(quoteValueTotal([
      { client_id: "c1", event_date: "2026-11-07", total: 12000 },
      { client_id: "c1", event_date: "2026-11-07", total: 9500 },
    ])).toBe(9500);
  });

  it("counts all of a client's quotes when the dates differ", () => {
    expect(quoteValueTotal([
      { client_id: "c1", event_date: "2026-11-07", total: 12000 },
      { client_id: "c1", event_date: "2026-12-05", total: 9500 },
    ])).toBe(21500);
  });

  it("keeps different clients on the same date separate", () => {
    expect(quoteValueTotal([
      { client_id: "c1", event_date: "2026-11-07", total: 12000 },
      { client_id: "c2", event_date: "2026-11-07", total: 9500 },
    ])).toBe(21500);
  });

  it("matches a client by email, then name, when there is no client record", () => {
    expect(quoteValueTotal([
      { client_email: "Natasha@Example.com", event_date: "2026-11-07T00:00:00Z", total: 5000 },
      { client_email: "natasha@example.com", event_date: "2026-11-07", total: 4000 },
      { client_name: "Carl", event_date: "2026-11-08", total: 3000 },
      { client_name: " carl ", event_date: "2026-11-08", total: 3500 },
    ])).toBe(7000);
  });

  it("counts quotes with no event date or no client on their own", () => {
    expect(quoteValueTotal([
      { client_id: "c1", event_date: null, total: 1000 },
      { client_id: "c1", event_date: null, total: 2000 },
      { event_date: "2026-11-07", total: 500 },
      { event_date: "2026-11-07", total: 700 },
    ])).toBe(4200);
  });

  it("treats a missing or invalid total as zero", () => {
    expect(quoteValueTotal([
      { client_id: "c1", event_date: "2026-11-07", total: null },
      { client_id: "c2", event_date: "2026-11-07", total: "abc" },
      { client_id: "c3", event_date: "2026-11-07", total: "1500.50" },
    ])).toBe(1500.5);
  });
});
