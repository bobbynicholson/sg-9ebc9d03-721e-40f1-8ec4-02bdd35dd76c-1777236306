/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Purging an order that came from a quote failed: the order-delete
// trigger updated the quote, the quote->order trigger then wrote onto
// the order mid-delete, and Postgres aborted the delete. The purge now
// detaches a kept quote before deleting the order.
const ORDER_ID = "order-1";
const QUOTE_ID = "quote-1";
const writes: Array<{ table: string; kind: string; values?: any; filters: Record<string, any> }> = [];
let otherOrdersOnQuote: any[] = [];

function svcQuery(table: string) {
  let current: any = null;
  const api: any = {
    select: () => api,
    neq: (col: string, val: any) => { if (current) current.filters[col] = { neq: val }; return api; },
    eq: (col: string, val: any) => { if (current) current.filters[col] = val; return api; },
    insert: (values: any) => { writes.push({ table, kind: "insert", values, filters: {} }); return Promise.resolve({ error: null }); },
    update: (values: any) => { current = { table, kind: "update", values, filters: {} }; writes.push(current); return api; },
    delete: () => { current = { table, kind: "delete", filters: {} }; writes.push(current); return api; },
    maybeSingle: async () => ({ data: table === "quotes" ? { id: QUOTE_ID, quote_number: "QUO-1" } : null, error: null }),
    then: (resolve: any) => resolve({ data: table === "orders" && !current ? otherOrdersOnQuote : [], error: null }),
  };
  return api;
}

jest.mock("@/lib/withApiLogging", () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock("@/services/order/releaseResources", () => ({ releaseOrderResources: jest.fn(async () => ({})) }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: () => ({ from: svcQuery }) }));
jest.mock("@/lib/supabase/server", () => ({
  createPagesServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "profiles"
              ? { role: "company_admin", active_role: null, company_id: "co-1" }
              : { id: ORDER_ID, company_id: "co-1", order_number: "ORD-1", status: "confirmed", quote_id: QUOTE_ID, deleted_at: null },
          }),
        }),
      }),
    }),
  }),
}));

import handler from "@/pages/api/orders/[id]/purge";

async function purge(body: any) {
  const res: any = { statusCode: 200, setHeader: jest.fn(), status(code: number) { this.statusCode = code; return this; }, json(b: any) { this.body = b; return this; } };
  await handler({ method: "POST", query: { id: ORDER_ID }, headers: {}, body: { confirm_order_number: "ORD-1", ...body } } as any, res);
  return res;
}

const indexOf = (pred: (w: (typeof writes)[number]) => boolean) => writes.findIndex(pred);
const orderDelete = (w: (typeof writes)[number]) => w.table === "orders" && w.kind === "delete";

beforeEach(() => { writes.length = 0; otherOrdersOnQuote = []; });

describe("purging an order that came from a quote", () => {
  it("detaches the kept quote before deleting the order", async () => {
    const res = await purge({});

    expect(res.statusCode).toBe(200);
    const detach = indexOf((w) => w.table === "quotes" && w.kind === "update");
    expect(detach).toBeGreaterThanOrEqual(0);
    expect(writes[detach]).toMatchObject({ values: { converted_to_order_id: null }, filters: { id: QUOTE_ID, converted_to_order_id: ORDER_ID } });
    expect(writes[detach].values).not.toHaveProperty("status");
    expect(detach).toBeLessThan(indexOf(orderDelete));
  });

  it("deletes the quote instead when asked, without detaching it", async () => {
    await purge({ also_delete_quote: true });

    expect(indexOf((w) => w.table === "quotes" && w.kind === "delete")).toBeLessThan(indexOf(orderDelete));
    expect(indexOf((w) => w.table === "quotes" && w.kind === "update")).toBe(-1);
  });

  it("still detaches when the quote is shared with another order and so is kept", async () => {
    otherOrdersOnQuote = [{ id: "order-2" }];

    await purge({ also_delete_quote: true });

    expect(indexOf((w) => w.table === "quotes" && w.kind === "delete")).toBe(-1);
    const detach = indexOf((w) => w.table === "quotes" && w.kind === "update");
    expect(detach).toBeGreaterThanOrEqual(0);
    expect(detach).toBeLessThan(indexOf(orderDelete));
  });
});
