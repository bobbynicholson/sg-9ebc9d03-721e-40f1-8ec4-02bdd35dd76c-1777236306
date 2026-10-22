/* eslint-disable @typescript-eslint/no-explicit-any */
// A lead whose email differs only in letter case from an existing
// client must link to that client, not try to insert a duplicate
// (clients are unique on company_id + lower(email)). The duplicate
// insert failed and left accepted quotes with no order or invoice.
jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/defaultRegion", () => ({ resolveDefaultRegionId: jest.fn() }));

import { lifecycleService } from "@/services/lifecycleService";

function makeDb(opts: { lead: any; clients: Array<{ id: string; email: string; company_name?: string | null }> }) {
  const calls = { ilike: [] as string[], eq: [] as Array<[string, any]>, inserted: [] as any[], updated: [] as any[] };
  const db: any = {
    from(table: string) {
      const filters: Record<string, any> = {};
      const q: any = {
        select: () => q,
        eq: (col: string, val: any) => { calls.eq.push([col, val]); filters[col] = val; return q; },
        ilike: (col: string, val: string) => { calls.ilike.push(val); filters[`ilike:${col}`] = val; return q; },
        is: () => q,
        update: (row: any) => { calls.updated.push({ table, row }); return q; },
        insert: (row: any) => { calls.inserted.push({ table, row }); return q; },
        single: async () => {
          if (table === "leads") return { data: opts.lead, error: null };
          if (table === "clients") return { data: { id: "new-client" }, error: null };
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (table !== "clients") return { data: null, error: null };
          const pattern = String(filters["ilike:email"] ?? "").replace(/\\([%_\\])/g, "$1").toLowerCase();
          const hit = opts.clients.find((c) => c.email.toLowerCase() === pattern);
          return { data: hit || null, error: null };
        },
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
      return q;
    },
  };
  return { db, calls };
}

const baseLead = {
  id: "lead-1",
  company_id: "co-1",
  region_id: "r-1",
  contact_name: "Aislinn Louis",
  email: "Aislinn.louis1@gmail.com",
  phone: "+27820000000",
  tags: null,
  notes: null,
  converted_to_client_id: null,
  deleted_at: null,
};

describe("promoteLeadToClient email matching", () => {
  it("links to an existing client whose email differs only in case", async () => {
    const { db, calls } = makeDb({ lead: baseLead, clients: [{ id: "client-existing", email: "aislinn.louis1@gmail.com" }] });
    const res = await lifecycleService.promoteLeadToClient("lead-1", { client: db });
    expect(res).toEqual({ clientId: "client-existing", isNew: false, alreadyConverted: false });
    expect(calls.inserted.filter((c) => c.table === "clients")).toHaveLength(0);
  });

  it("escapes LIKE wildcards so an underscore only matches itself", async () => {
    const lead = { ...baseLead, email: "jo_smith@x.com" };
    const { db, calls } = makeDb({ lead, clients: [{ id: "c-1", email: "joXsmith@x.com" }] });
    const res = await lifecycleService.promoteLeadToClient("lead-1", { client: db });
    expect(calls.ilike).toContain("jo\\_smith@x.com");
    expect(res.isNew).toBe(true);
  });

  it("still creates a client when none matches", async () => {
    const { db, calls } = makeDb({ lead: baseLead, clients: [] });
    const res = await lifecycleService.promoteLeadToClient("lead-1", { client: db });
    expect(res).toEqual({ clientId: "new-client", isNew: true, alreadyConverted: false });
    expect(calls.inserted.filter((c) => c.table === "clients")).toHaveLength(1);
  });

  it("carries a lead's company while retaining the person's contact name", async () => {
    const { db, calls } = makeDb({ lead: { ...baseLead, company_name: "Example Ltd" }, clients: [] });
    await lifecycleService.promoteLeadToClient("lead-1", { client: db });
    expect(calls.inserted.find((c) => c.table === "clients").row).toMatchObject({ client_name: "Aislinn Louis", company_name: "Example Ltd", client_type: "company" });
  });

  it("fills a missing organisation on an existing client", async () => {
    const { db, calls } = makeDb({ lead: { ...baseLead, company_name: "Example Ltd" }, clients: [{ id: "existing", email: baseLead.email, company_name: null }] });
    await lifecycleService.promoteLeadToClient("lead-1", { client: db });
    expect(calls.updated.find((c) => c.table === "clients").row).toMatchObject({ company_name: "Example Ltd" });
  });

  it("keeps an existing client's deliberately different organisation", async () => {
    const { db, calls } = makeDb({ lead: { ...baseLead, company_name: "Event subsidiary" }, clients: [{ id: "existing", email: baseLead.email, company_name: "Parent company" }] });
    await lifecycleService.promoteLeadToClient("lead-1", { client: db });
    expect(calls.updated.filter((c) => c.table === "clients")).toHaveLength(0);
  });
});
