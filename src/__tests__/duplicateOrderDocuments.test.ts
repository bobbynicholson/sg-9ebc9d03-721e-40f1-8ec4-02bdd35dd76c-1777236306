/* eslint-disable @typescript-eslint/no-explicit-any */
// Duplicating an order must give the copy its own quote and an unsent
// draft invoice (a rebooked order was billed with an invoice but no
// quote), the quote must follow later order edits without the
// quote->order trigger overwriting the order, and draft invoices must
// not trigger payment reminder emails.
import * as fs from "fs";
import * as path from "path";

jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/defaultRegion", () => ({ resolveDefaultRegionId: jest.fn(async () => "default-region") }));
jest.mock("@/lib/menuCourses", () => ({
  fetchMenuCategories: jest.fn(async () => new Map()),
  sortByCourse: (items: any[]) => items,
}));
jest.mock("@/services/invoiceDueDateService", () => ({ reconcileCompanyInvoiceDueDates: jest.fn() }));
jest.mock("@/services/documentAmountChanges", () => ({ recordDocumentAmountChange: jest.fn(async () => ({})) }));
jest.mock("@/lib/publicInvoiceLines", () => ({ hydratePublicInvoiceLines: jest.fn(async (_sb: any, data: any) => data) }));

const ensureInvoiceForOrder = jest.fn();
jest.mock("@/services/invoiceGenerationService", () => {
  const actual = jest.requireActual("@/services/invoiceGenerationService");
  return { ...actual, ensureInvoiceForOrder: (...args: any[]) => ensureInvoiceForOrder(...args) };
});

import { createDuplicateOrderDocuments, quoteMirrorFieldsFromOrder, DUPLICATE_ORDER_QUOTE_SOURCE } from "@/services/order/duplicateOrderDocuments";
import { syncOrderArtifacts } from "@/services/order/orderSyncService";

const ORDER = {
  id: "order-2", company_id: "co-1", region_id: "region-1", client_id: "client-1", quote_id: null,
  client_name: "Pat Client", client_email: "pat@example.com", client_phone: "0720000000", client_company_name: "Acme",
  event_name: "Team lunch", event_date: "2026-11-06", event_time: "12:00:00", setup_time: "11:00:00",
  guest_count: 40, venue_address: "1 Main Rd", venue_lat: null, venue_lng: null,
  subtotal: 1000, tax_amount: 150, tax: 150, total_amount: 1150, discount_amount: 50, deposit_percentage: 50,
  delivery_fee: 120, delivery_distance_km: 12, delivery_rate_per_km: 10,
  collection_fee: 0, collection_distance_km: null, collection_rate_per_km: null, collection_next_day: false,
  waiter_service_required: true, waiter_count: 2, waiter_duration_hours: 4, waiter_hourly_rate: 90, waiter_total_fee: 720,
  currency: "ZAR", equipment_return_method: null,
};

/** Chainable Supabase stand-in that records writes. */
function makeDb(rows: { orders?: any; quotes?: any; items?: any[]; invoices?: any }) {
  const calls = { inserted: [] as any[], updated: [] as any[], rpc: [] as any[] };
  const db: any = {
    rpc: jest.fn(async (fn: string, args: any) => { calls.rpc.push({ fn, args }); return { data: "QUO-000123", error: null }; }),
    from(table: string) {
      let pendingWrite: any = null;
      const q: any = {
        select: () => q, eq: () => q, is: () => q, order: () => q, in: () => q, neq: () => q, gt: () => q, limit: () => q,
        insert: (row: any) => { pendingWrite = { kind: "insert", table, row }; calls.inserted.push({ table, row }); return q; },
        update: (row: any) => { pendingWrite = { kind: "update", table, row }; calls.updated.push({ table, row }); return q; },
        single: async () => (pendingWrite?.kind === "insert" && table === "quotes"
          ? { data: { id: "quote-new" }, error: null }
          : { data: rows[table as keyof typeof rows] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[table as keyof typeof rows] ?? null, error: null }),
        then: (resolve: any) => resolve({
          data: table === "order_items" ? (rows.items || []) : table === "equipment_bookings" ? [] : null,
          error: null,
        }),
      };
      return q;
    },
  };
  return { db, calls };
}

beforeEach(() => {
  ensureInvoiceForOrder.mockReset();
  ensureInvoiceForOrder.mockResolvedValue({ success: true, invoiceId: "invoice-new" });
});

describe("duplicating an order", () => {
  it("creates an accepted quote that follows the order and links it, then a draft invoice", async () => {
    const { db, calls } = makeDb({
      orders: ORDER,
      quotes: { lead_id: "lead-1" },
      items: [{ id: "i1", menu_item_id: "m1", item_name: "Wraps", quantity: 40, unit_price: 25, line_total: 1000 }],
    });

    const result = await createDuplicateOrderDocuments(db, "order-2", "quote-old");

    expect(result).toEqual({ quoteId: "quote-new", invoiceId: "invoice-new", problems: [] });
    expect(calls.rpc).toEqual([{ fn: "consume_next_document_number", args: { p_company_id: "co-1", p_document_type: "quote" } }]);
    const quote = calls.inserted.find((c) => c.table === "quotes").row;
    expect(quote).toMatchObject({
      quote_number: "QUO-000123", status: "accepted", converted_to_order_id: "order-2",
      parent_quote_id: "quote-old", external_source: DUPLICATE_ORDER_QUOTE_SOURCE,
      client_id: "client-1", lead_id: "lead-1", quote_name: "Team lunch", total: 1150, total_amount: 1150,
      client_email: "pat@example.com", discount_amount: 50, waiter_hourly_rate: 90,
    });
    expect(quote.menu_items).toEqual([expect.objectContaining({ name: "Wraps", quantity: 40, unit_price: 25, line_total: 1000 })]);
    expect(calls.updated).toContainEqual({ table: "orders", row: { quote_id: "quote-new" } });
    expect(ensureInvoiceForOrder).toHaveBeenCalledWith("order-2", "co-1", db, { force: true, draft: true });
  });

  it("still creates the invoice and reports why when the quote cannot be made", async () => {
    const { db, calls } = makeDb({ orders: { ...ORDER, client_id: null } });

    const result = await createDuplicateOrderDocuments(db, "order-2", null);

    expect(result.quoteId).toBeNull();
    expect(result.invoiceId).toBe("invoice-new");
    expect(result.problems).toEqual(["The quote was not created (the order has no client linked)."]);
    expect(calls.inserted.filter((c) => c.table === "quotes")).toHaveLength(0);
    expect(calls.rpc).toHaveLength(0);
  });

  it("reports a failed invoice instead of hiding it", async () => {
    ensureInvoiceForOrder.mockResolvedValue({ success: false, error: "no line items" });
    const { db } = makeDb({ orders: ORDER, quotes: null });

    const result = await createDuplicateOrderDocuments(db, "order-2", null);

    expect(result.quoteId).toBe("quote-new");
    expect(result.problems).toEqual(["The invoice was not created (no line items)."]);
  });
});

describe("quote fields copied back to the order", () => {
  it("covers every field the quote->order trigger mirrors, so syncing never overwrites the order", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260901100001_mirror_quote_waiter_service.sql"),
      "utf8",
    );
    const mirrored = Array.from(sql.matchAll(/NEW\.([a-z_]+)/g)).map((m) => m[1]).filter((c) => c !== "id");
    const fields = quoteMirrorFieldsFromOrder(ORDER);
    for (const column of new Set(mirrored)) expect(fields).toHaveProperty(column);
  });
});

describe("order edits reach the duplicate's quote", () => {
  const syncRows = (quote: any) => ({
    orders: { ...ORDER, quote_id: "quote-new", companies: { pricing_includes_vat: false } },
    quotes: quote,
    invoices: null,
    items: [{ id: "i1", menu_item_id: "m1", item_name: "Wraps", quantity: 40, unit_price: 25, line_total: 1000 }],
  });

  it("updates an accepted quote created by duplicating, with every mirrored field", async () => {
    const { db, calls } = makeDb(syncRows({ status: "accepted", accepted_at: "2026-10-27", external_source: DUPLICATE_ORDER_QUOTE_SOURCE }));

    const res = await syncOrderArtifacts("order-2", db);

    expect(res.ok).toBe(true);
    const quoteUpdate = calls.updated.find((c) => c.table === "quotes");
    expect(quoteUpdate.row).toMatchObject({ total: 1150, discount_amount: 50, waiter_hourly_rate: 90, delivery_fee: 120, quote_name: "Team lunch" });
  });

  it("leaves a quote the client accepted unchanged", async () => {
    const { db, calls } = makeDb(syncRows({ status: "accepted", accepted_at: "2026-10-01", external_source: null }));

    await syncOrderArtifacts("order-2", db);

    expect(calls.updated.find((c) => c.table === "quotes")).toBeUndefined();
  });
});

describe("draft invoices", () => {
  it("are saved as draft when asked", async () => {
    const { createInvoiceRecord } = jest.requireActual("@/services/invoiceGenerationService");
    const inserted: any[] = [];
    const db: any = {
      from: (table: string) => {
        const q: any = {
          select: () => q, eq: () => q,
          insert: (row: any) => { inserted.push({ table, row }); return q; },
          single: async () => (table === "orders"
            ? { data: { client_id: "client-1" }, error: null }
            : { data: { id: "inv-1", public_token: "tok" }, error: null }),
        };
        return q;
      },
    };
    const data = { invoiceNumber: "INV-1", invoiceDate: "2026-10-27", dueDate: "2026-11-01", subtotal: 1000, taxAmount: 150, total: 1150, depositPaid: 0, balanceDue: 1150 };

    await createInvoiceRecord(data, "order-2", "co-1", db, { draft: true });
    await createInvoiceRecord(data, "order-2", "co-1", db);

    expect(inserted.map((i) => i.row.status)).toEqual(["draft", "sent"]);
  });

  it.each([
    "src/pages/api/cron/deposit-reminder.ts",
    "src/pages/api/cron/balance-reminder.ts",
  ])("are skipped by %s", (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source).toMatch(/\.neq\("status", "draft"\)/);
  });
});
