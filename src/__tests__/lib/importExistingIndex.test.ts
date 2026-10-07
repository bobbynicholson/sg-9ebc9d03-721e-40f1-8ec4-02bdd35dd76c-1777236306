import { loadClientIndex, loadLeadIndex, emailKey } from "@/lib/importExistingIndex";

/** Fake Supabase table: records the filters and serves rows in pages. */
function fakeSupabase(rows: Record<string, any[]>) {
  const calls: Array<{ table: string; filters: string[] }> = [];
  return {
    calls,
    from(table: string) {
      const filters: string[] = [];
      calls.push({ table, filters });
      let lo = 0; let hi = 0;
      const api: any = {
        select: () => api,
        eq: (c: string, v: string) => { filters.push(`${c}=${v}`); return api; },
        is: (c: string, v: null) => { filters.push(`${c} is ${v}`); return api; },
        order: () => api,
        range: (a: number, b: number) => { lo = a; hi = b; return api; },
        then: (resolve: any) => resolve({ data: (rows[table] || []).slice(lo, hi + 1), error: null }),
      };
      return api;
    },
  };
}

describe("existing-record index", () => {
  it("keys clients by lower(trim(email)) like the unique index", async () => {
    const sb = fakeSupabase({ clients: [{ id: "1", email: "  Thabo@Example.COM ", client_name: "Thabo Mokoena" }] });
    const { clientByEmail, clientByName } = await loadClientIndex(sb, "co1");
    expect(clientByEmail.get(emailKey("thabo@example.com"))).toBe("1");
    expect(clientByName.get("thabo mokoena")).toBe("1");
  });

  it("only reads live rows of the caller's company", async () => {
    const sb = fakeSupabase({ clients: [] });
    await loadClientIndex(sb, "co1");
    expect(sb.calls[0].filters).toEqual(expect.arrayContaining(["company_id=co1", "deleted_at is null"]));
  });

  it("pages past 1000 rows", async () => {
    const clients = Array.from({ length: 2500 }, (_, i) => ({ id: String(i), email: `c${i}@x.co.za`, client_name: null }));
    const { clientByEmail } = await loadClientIndex(fakeSupabase({ clients }), "co1");
    expect(clientByEmail.size).toBe(2500);
    expect(clientByEmail.get("c2499@x.co.za")).toBe("2499");
  });

  it("matches leads on email or client_email", async () => {
    const sb = fakeSupabase({ leads: [{ id: "L1", email: null, client_email: "Lead@X.co.za" }] });
    expect((await loadLeadIndex(sb, "co1")).get("lead@x.co.za")).toBe("L1");
  });
});
