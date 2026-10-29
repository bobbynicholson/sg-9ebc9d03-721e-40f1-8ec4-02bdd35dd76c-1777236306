import { hydratePublicInvoiceLines, menuInvoiceLineFromRow, equipmentInvoiceLineFromRow } from "@/lib/publicInvoiceLines";

function source(rows: Record<string, unknown>) {
  const from = jest.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: rows[table] || null }),
        order: async () => ({ data: rows[table] || [] }),
        neq: () => ({ order: async () => ({ data: rows[table] || [] }) }),
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
  // The quote is read only for agreed equipment prices; its lines are not used.
  expect(result.menuItems).toHaveLength(1);
});

// ORD-918899: 25cm plates were swapped for 20cm plates (25cm booking
// cancelled). The invoice listed both, and priced knives/forks at the
// catalogue R1 instead of the quoted R2 because bookings carry no price.
it("leaves out cancelled bookings and uses the quoted price for each item", async () => {
  const neq = jest.fn(() => ({ order: async () => ({ data: [
    { equipment_id: "e-knife", quantity: 30, unit_price: null, equipment: { name: "Stainless Steel Knife", rental_price: 1 } },
    { equipment_id: "e-plate20", quantity: 30, unit_price: null, equipment: { name: "Plate 20cm", rental_price: 3 } },
  ] }) }));
  const db = { from: jest.fn((table: string) => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: table === "orders" ? { quote_id: "q-1" }
      : table === "quotes" ? { equipment_items: [
        { equipment_id: "e-plate20", name: "Plate 20cm", quantity: 30, unit_price: 3 },
        { equipment_id: "e-knife", name: "Stainless Steel Knife", quantity: 30, unit_price: 2 },
      ] } : null }),
    order: async () => ({ data: [] }),
    neq,
  }) }) })) };
  const result = await hydratePublicInvoiceLines(db, { equipmentItems: [{ description: "Plate 25cm", total: 90 }] }, "order-1", null, { preferCurrentOrderLines: true });
  expect(neq).toHaveBeenCalledWith("status", "cancelled");
  expect(result.equipmentItems.map((l: any) => [l.description, l.unitPrice, l.total])).toEqual([
    ["Stainless Steel Knife", 2, 60],
    ["Plate 20cm", 3, 90],
  ]);
});
