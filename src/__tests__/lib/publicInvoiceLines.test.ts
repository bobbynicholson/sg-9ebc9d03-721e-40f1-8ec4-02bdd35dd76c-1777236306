import { hydratePublicInvoiceLines, menuInvoiceLineFromRow, equipmentInvoiceLineFromRow } from "@/lib/publicInvoiceLines";

function source(rows: Record<string, unknown>) {
  const from = jest.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: rows[table] || null }),
        order: async () => ({ data: rows[table] || [] }),
      }),
    }),
  }));
  return { from };
}

it("keeps the cutlery and crockery item name alongside its detail and price", async () => {
  const db = source({
    quotes: {
      menu_items: [{ item_name: "Cutlery & Crockery", description: "Plate, knife & fork", quantity: 50, unit_price: 12, total: 600 }],
      equipment_items: [{ name: "Serving plates", description: "White ceramic", quantity: 50, unit_price: 4, total: 200 }],
    },
  });
  const lines = await hydratePublicInvoiceLines(db, { items: [{ description: "Delivery", total: 100 }] }, "order-1", "quote-1");
  expect(lines.menuItems).toEqual([expect.objectContaining({ description: "Cutlery & Crockery - Plate, knife & fork", total: 600 })]);
  expect(lines.equipmentItems).toEqual([expect.objectContaining({ description: "Serving plates - White ceramic", total: 200 })]);
  expect(lines.items).toEqual([{ description: "Delivery", total: 100 }]);
});

it("falls back to order rows when the linked quote has no saved lines", async () => {
  const db = source({
    order_items: [{ item_name: "Cutlery & Crockery", description: "Plate, knife & fork", quantity: 30, unit_price: 10, line_total: 300 }],
    equipment_bookings: [{ quantity: 30, unit_price: 2, equipment: { name: "Dinner plates", rental_price: 2 } }],
  });
  const lines = await hydratePublicInvoiceLines(db, {}, "order-1", null);
  expect(lines.menuItems[0].description).toBe("Cutlery & Crockery - Plate, knife & fork");
  expect(lines.equipmentItems[0]).toMatchObject({ description: "Dinner plates", total: 60 });
});

it("keeps existing invoice snapshots without querying current order or quote lines", async () => {
  const db = source({});
  const snapshot = { menuItems: [menuInvoiceLineFromRow({ item_name: "Original menu", total: 100 })], equipmentItems: [equipmentInvoiceLineFromRow({ name: "Original plates", total: 50 })] };
  expect(await hydratePublicInvoiceLines(db, snapshot, "order-1", "quote-1")).toEqual(snapshot);
  expect(db.from).not.toHaveBeenCalled();
});

it("replaces stale saved lines with the current order while retaining the invoice's charges", async () => {
  const db = source({
    order_items: [{ item_name: "Cutlery & Crockery", description: "Plate, knife & fork", quantity: 50, unit_price: 12, line_total: 600 }],
    equipment_bookings: [{ quantity: 50, unit_price: 4, equipment: [{ name: "Serving plates", rental_price: 4 }] }],
  });
  const invoiceData = {
    menuItems: [{ description: "Old menu", total: 100 }],
    equipmentItems: [{ description: "Old equipment", total: 100 }],
    items: [{ description: "Delivery", total: 50 }],
  };
  const result = await hydratePublicInvoiceLines(db, invoiceData, "order-1", "accepted-quote", { preferCurrentOrderLines: true });
  expect(result.menuItems[0]).toMatchObject({ description: "Cutlery & Crockery - Plate, knife & fork", total: 600 });
  expect(result.equipmentItems[0]).toMatchObject({ description: "Serving plates", total: 200 });
  expect(result.items).toEqual(invoiceData.items);
  expect(db.from).not.toHaveBeenCalledWith("quotes");
});
