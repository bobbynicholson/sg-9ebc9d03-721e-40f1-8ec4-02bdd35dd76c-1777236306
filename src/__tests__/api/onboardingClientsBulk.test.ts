/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
let existingEmails: string[] = [];
let failEmail: string | null = null;
let inserted: any[] = [];

function clientsTable() {
  let from = 0; let to = 0;
  const api: any = {
    select: () => api, eq: () => api, is: () => api, order: () => api,
    range: (a: number, b: number) => { from = a; to = b; return api; },
    then: (resolve: any) => resolve({
      data: existingEmails.slice(from, to + 1).map((email, i) => ({ id: `c-${from + i}`, email, client_name: null })),
      error: null,
    }),
    insert: (payload: any) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      const bad = rows.find((r) => r.email === failEmail);
      if (bad) return Promise.resolve({ error: { code: rows.length > 1 ? "23514" : "23505", message: "duplicate" } });
      inserted.push(...rows);
      return Promise.resolve({ error: null });
    },
  };
  return api;
}
function genericTable() {
  const api: any = {
    select: () => api, eq: () => api, order: () => api, limit: () => api, insert: () => api,
    maybeSingle: async () => ({ data: { id: "region-1" }, error: null }),
    single: async () => ({ data: { id: "job-1" }, error: null }),
  };
  return api;
}

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({ from: (t: string) => (t === "clients" ? clientsTable() : genericTable()) }),
}));
jest.mock("@/lib/supabase/server", () => ({ createPagesServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: "owner", company_id: "co1" } }) }) }) }),
}) }));

import handler from "@/pages/api/onboarding/clients/bulk";

async function post(rows: any[]) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method: "POST", headers: {}, body: { rows, filename: "customers.csv" } } as any, res);
  return res;
}

beforeEach(() => { existingEmails = []; failEmail = null; inserted = []; });

test("existing clients beyond the first 1000 are still recognised as duplicates", async () => {
  existingEmails = Array.from({ length: 1500 }, (_, i) => `c${i}@x.co.za`);
  const res = await post([
    { name: "Old", email: "c1400@x.co.za" },
    { name: "New", email: "new@x.co.za" },
  ]);
  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({ imported: 1, skipped: 1 });
  expect(inserted.map((r) => r.email)).toEqual(["new@x.co.za"]);
});

test("a company name becomes the client name and the person the contact", async () => {
  await post([{ company_name: "911 Service Centre", name: "Joanna", surname: "Schrenk", email: "admin@911.co.za" }]);
  expect(inserted[0]).toMatchObject({ client_name: "911 Service Centre", client_type: "company", notes: "Contact: Joanna Schrenk" });
});

test("a person without a company keeps their own name", async () => {
  await post([{ name: "Aaron", surname: "Rhodes", email: "aaron@x.co.za" }]);
  expect(inserted[0]).toMatchObject({ client_name: "Aaron Rhodes", client_type: "individual", notes: null });
});

test("one failing row does not stop the rest of the import", async () => {
  failEmail = "clash@x.co.za";
  const res = await post([
    { name: "A", email: "a@x.co.za" },
    { name: "Clash", email: "clash@x.co.za" },
    { name: "B", email: "b@x.co.za" },
  ]);
  expect(res.body.imported).toBe(2);
  expect(res.body.skipped).toBe(1);
  expect(inserted.map((r) => r.email)).toEqual(["a@x.co.za", "b@x.co.za"]);
});

test("rows without any name or email are rejected with a reason", async () => {
  const res = await post([{ email: "noname@x.co.za" }, { name: "No email" }]);
  expect(res.body.rejected).toBe(2);
  expect(res.body.outcomes.map((o: any) => o.reason)).toEqual(["Name is required", "Email is required"]);
});

test("a saved email with capitals still counts as the same client", async () => {
  existingEmails = ["Thabo.Mokoena@Example.com"];
  const res = await post([{ name: "Thabo", email: "thabo.mokoena@example.com" }]);
  expect(res.body).toMatchObject({ imported: 0, skipped: 1 });
  expect(inserted).toEqual([]);
});
