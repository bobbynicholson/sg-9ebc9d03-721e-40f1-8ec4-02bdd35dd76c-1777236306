jest.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  applyOrderValueDelta,
  syncInvoiceValuesFromOrder,
} from "@/services/order/orderSyncService";
import { refundableExcessAmount } from "@/lib/invoiceRefunds";

describe("refundableExcessAmount", () => {
  it("calculates a refund after a paid invoice is reduced", () => {
    expect(refundableExcessAmount(9000, 8000, 0)).toBe(1000);
  });

  it("subtracts pending refunds to avoid queueing the same excess twice", () => {
    expect(refundableExcessAmount(9000, 8000, 400)).toBe(600);
  });

  it("returns zero when there is no paid excess", () => {
    expect(refundableExcessAmount(7000, 8000, 0)).toBe(0);
  });
});

describe("applyOrderValueDelta", () => {
  it("preserves fees and surge while applying menu changes and discount changes", () => {
    expect(applyOrderValueDelta(1000, 800, 900, 50, 75)).toBe(1075);
  });

  it("applies line changes against gross values for VAT-inclusive orders", () => {
    expect(applyOrderValueDelta(1150, 1000, 1100, 0, 0)).toBe(1250);
  });
});

describe("syncInvoiceValuesFromOrder", () => {
  it("reopens a fully paid invoice when the order total increases", async () => {
    const order = {
      subtotal: 8556.52,
      tax_amount: 1283.48,
      total_amount: 9840,
      guest_count: 40,
    };
    const invoice = {
      id: "invoice-1",
      amount_paid: 9629.72,
      status: "paid",
      invoice_data: { items: [{ description: "Saved items" }] },
    };
    let invoicePatch: any;
    const client = {
      from: jest.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          maybeSingle: async () => ({ data: table === "orders" ? order : invoice, error: null }),
          update: (patch: any) => {
            invoicePatch = patch;
            return { eq: async () => ({ error: null }) };
          },
        };
        return builder;
      }),
    };

    const result = await syncInvoiceValuesFromOrder("order-1", client);

    expect(result.invoice_id).toBe("invoice-1");
    expect(invoicePatch).toMatchObject({
      subtotal: 8556.52,
      tax_amount: 1283.48,
      total_amount: 9840,
      amount_paid: 9629.72,
      balance_due: 210.28,
      status: "partially_paid",
      invoice_data: {
        items: [{ description: "Saved items" }],
        total: 9840,
        balanceDue: 210.28,
      },
    });
  });

  it("keeps a reduced invoice paid and preserves the original payment amount", async () => {
    const order = {
      subtotal: 7826.09,
      tax_amount: 1173.91,
      total_amount: 9000,
      guest_count: 36,
    };
    const invoice = {
      id: "invoice-1",
      amount_paid: 9629.72,
      status: "paid",
      invoice_data: { items: [{ description: "Saved items" }] },
    };
    let invoicePatch: any;
    const client = {
      from: jest.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          maybeSingle: async () => ({ data: table === "orders" ? order : invoice, error: null }),
          update: (patch: any) => {
            invoicePatch = patch;
            return { eq: async () => ({ error: null }) };
          },
        };
        return builder;
      }),
    };

    await syncInvoiceValuesFromOrder("order-1", client);

    expect(invoicePatch).toMatchObject({
      total_amount: 9000,
      amount_paid: 9629.72,
      balance_due: 0,
      status: "paid",
    });
  });

  it("refreshes current order values and preserves invoice item snapshots", async () => {
    const items = [{ description: "Existing menu item", total: 500 }];
    const order = {
      subtotal: 1200,
      tax_amount: 180,
      total_amount: 1380,
      client_name: "Updated client",
      client_email: "updated@example.com",
      client_phone: "0820000000",
      event_name: "Updated event",
      event_date: "2027-02-07",
      event_time: "13:00",
      venue_address: "Updated venue",
      guest_count: 60,
    };
    const invoice = {
      id: "invoice-1",
      amount_paid: 300,
      status: "paid",
      invoice_data: { items, guestCount: 20, venue: "Old venue" },
    };
    let invoicePatch: any;
    const client = {
      from: jest.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          maybeSingle: async () => ({
            data: table === "orders" ? order : invoice,
            error: null,
          }),
          update: (patch: any) => {
            invoicePatch = patch;
            return { eq: async () => ({ error: null }) };
          },
        };
        return builder;
      }),
    };

    const result = await syncInvoiceValuesFromOrder("order-1", client);

    expect(result).toEqual({ invoice_id: "invoice-1" });
    expect(invoicePatch).toMatchObject({
      subtotal: 1200,
      tax_amount: 180,
      total_amount: 1380,
      amount_paid: 300,
      balance_due: 1080,
      status: "partially_paid",
      invoice_data: {
        items,
        guestCount: 60,
        venue: "Updated venue",
        eventDate: "2027-02-07",
        eventTime: "13:00",
        clientName: "Updated client",
        clientEmail: "updated@example.com",
        clientPhone: "0820000000",
        total: 1380,
      },
    });
  });
});