/**
 * @jest-environment node
 */
import handler from "@/pages/api/admin/whatsapp/consent";

let mockColumnExists = true;
const mockClients = Array.from({ length: 60 }, (_, n) => ({
  id: `c${n}`,
  company_id: n < 55 ? "company-1" : "company-2",
  client_name: `Client ${String(n).padStart(2, "0")}`,
  phone: `08200000${n}`,
  mobile_number: null,
  whatsapp_opt_in: n < 3 ? true : n === 3 ? false : null,
}));
const mockUpdates: any[] = [];

jest.mock("@/lib/subscriptionApiGate", () => ({ isSubscriptionGatedRequest: () => false, blockIfCompanyUnpaid: jest.fn() }));
jest.mock("@/lib/platformApiGate", () => ({ isPlatformOnlyRequest: () => false, blockUnlessPlatformAdmin: jest.fn() }));
jest.mock("@/lib/whatsapp/adminAccess", () => ({
  companyForAdmin: async () => ({ companyId: "company-1", userId: "user-1" }),
}));
jest.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({
    from: () => {
      const filters: Array<(row: any) => boolean> = [];
      let fields = "";
      let head = false;
      let range: [number, number] | null = null;
      let update: any = null;
      const missingColumn = () => !mockColumnExists && fields.includes("whatsapp_opt_in");
      const chain: any = {
        select: (columns: string, options?: { head?: boolean }) => { fields = columns; head = !!options?.head; return chain; },
        eq: (column: string, value: unknown) => {
          if (column === "whatsapp_opt_in") fields += ",whatsapp_opt_in";
          filters.push((row) => row[column] === value);
          return chain;
        },
        is: (column: string, value: unknown) => {
          if (column !== "deleted_at") filters.push((row) => row[column] === value);
          return chain;
        },
        or: (expression: string) => {
          const term = /ilike\.%([^%]+)%/.exec(expression)?.[1]?.toLowerCase() || "";
          filters.push((row) => row.client_name.toLowerCase().includes(term));
          return chain;
        },
        order: () => chain,
        range: (from: number, to: number) => { range = [from, to]; return chain; },
        update: (patch: any) => { update = patch; return chain; },
        then: (resolve: any) => {
          if (update) {
            mockUpdates.push({ update, matched: mockClients.filter((row) => filters.every((filter) => filter(row))).length });
            return Promise.resolve({ error: null }).then(resolve);
          }
          if (missingColumn()) return Promise.resolve({ data: null, count: null, error: { message: "column does not exist" } }).then(resolve);
          const rows = mockClients.filter((row) => filters.every((filter) => filter(row)));
          return Promise.resolve({
            data: head ? null : (range ? rows.slice(range[0], range[1] + 1) : rows).map((row) => (mockColumnExists ? row : { ...row, whatsapp_opt_in: undefined })),
            count: rows.length,
            error: null,
          }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));

async function call(method: string, query: Record<string, string> = {}, body?: unknown) {
  const res: any = {
    statusCode: 0, body: null,
    setHeader() { return this; }, getHeader() { return undefined; }, end() { return this; }, on() { return this; }, once() { return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  await handler({ method, query, body, headers: {}, cookies: {}, url: "/api/admin/whatsapp/consent" } as any, res);
  return res;
}

describe("client consent list", () => {
  beforeEach(() => {
    mockColumnExists = true;
    mockUpdates.length = 0;
  });

  it("pages through every client, with correct counts", async () => {
    const first = await call("GET");
    expect(first.body.clients).toHaveLength(25);
    expect(first.body.matching).toBe(55);
    expect(first.body.counts).toEqual({ all: 55, agreed: 3, optedOut: 1, notAsked: 51 });
    const last = await call("GET", { page: "3" });
    expect(last.body.clients).toHaveLength(5);
    expect(last.body.clients[0].id).toBe("c50");
  });

  it("skips the totals when only moving between pages", async () => {
    const { body } = await call("GET", { page: "2", counts: "0" });
    expect(body.clients).toHaveLength(25);
    expect(body.counts).toBeUndefined();
  });

  it("never shows another company's clients", async () => {
    const pages = await Promise.all(["1", "2", "3"].map((page) => call("GET", { page })));
    const ids = pages.flatMap((page) => page.body.clients.map((client: any) => client.id));
    expect(ids).toHaveLength(55);
    expect(ids).not.toContain("c55");
  });

  it("filters by consent and searches by name", async () => {
    expect((await call("GET", { filter: "agreed" })).body.matching).toBe(3);
    expect((await call("GET", { filter: "opted_out" })).body.matching).toBe(1);
    expect((await call("GET", { filter: "not_asked" })).body.matching).toBe(51);
    expect((await call("GET", { q: "Client 07" })).body.clients.map((client: any) => client.id)).toEqual(["c7"]);
  });

  it("still lists every client before the database update, with saving off", async () => {
    mockColumnExists = false;
    const { body, statusCode } = await call("GET");
    expect(statusCode).toBe(200);
    expect(body.canSave).toBe(false);
    expect(body.clients).toHaveLength(25);
    expect(body.counts.all).toBe(55);
    expect(body.clients[0].whatsapp_opt_in).toBeNull();
  });

  it("only saves for a client in this company", async () => {
    await call("POST", {}, { clientId: "c1", agreed: false });
    await call("POST", {}, { clientId: "c58", agreed: false });
    expect(mockUpdates.map((item) => item.matched)).toEqual([1, 0]);
  });

  it("rejects a bad answer", async () => {
    expect((await call("POST", {}, { clientId: "c1", agreed: "yes" })).statusCode).toBe(400);
  });
});
