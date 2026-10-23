/** Fill missing invoice line snapshots for older order-linked invoices. */
export function invoiceRows(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

function moneyNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function lineDescription(name: unknown, detail: unknown, fallback: string): string {
  const title = String(name || "").trim();
  const description = String(detail || "").trim();
  return [title, description && description !== title ? description : ""].filter(Boolean).join(" - ") || fallback;
}

export function menuInvoiceLineFromRow(row: Record<string, any>) {
  const quantity = moneyNumber(row.quantity, row.qty, 1) || 1;
  const unitPrice = moneyNumber(row.unitPrice, row.unit_price, row.price);
  return {
    description: lineDescription(row.item_name || row.menu_item_name || row.name, row.description, "Menu item"),
    category: row.category ?? null,
    quantity,
    unitPrice,
    total: moneyNumber(row.total, row.line_total, row.lineTotal, quantity * unitPrice),
    note: row.notes || row.note || null,
  };
}

export function equipmentInvoiceLineFromRow(row: Record<string, any>) {
  const equipment = (Array.isArray(row.equipment) ? row.equipment[0] : row.equipment) || {};
  const quantity = moneyNumber(row.quantity, row.qty, 1) || 1;
  const unitPrice = moneyNumber(row.unitPrice, row.unit_price, row.rentalPrice, row.rental_price, equipment.rental_price);
  return {
    description: lineDescription(row.equipment_name || row.name || equipment.name, row.description, "Equipment"),
    quantity,
    unitPrice,
    total: moneyNumber(row.total, row.line_total, row.lineTotal, quantity * unitPrice),
    isHireIn: row.isHireIn ?? row.is_hire_in ?? equipment.is_hire_in ?? false,
    note: row.notes || row.note || null,
  };
}

type QueryClient = { from: (table: string) => any };

export async function hydratePublicInvoiceLines(
  supabase: QueryClient,
  invoiceData: Record<string, any>,
  orderId: string | null | undefined,
  quoteId: string | null | undefined,
  options: { preferCurrentOrderLines?: boolean } = {},
): Promise<Record<string, any>> {
  const result = { ...invoiceData };
  if (!orderId) return result;

  const needsMenu = invoiceRows(result.menuItems).length === 0 && invoiceRows(result.menu_items).length === 0;
  const needsEquipment = invoiceRows(result.equipmentItems).length === 0 && invoiceRows(result.equipment_items).length === 0;
  if (!needsMenu && !needsEquipment && !options.preferCurrentOrderLines) return result;

  let quote: Record<string, any> | null = null;
  if (quoteId && (needsMenu || needsEquipment)) {
    const response = await supabase.from("quotes")
      .select("menu_items, equipment_items").eq("id", quoteId).maybeSingle();
    quote = response.data || null;
  }

  if (needsMenu || options.preferCurrentOrderLines) {
    let rows = invoiceRows(quote?.menu_items);
    if (rows.length === 0 || options.preferCurrentOrderLines) {
      const response = await supabase.from("order_items")
        .select("item_name, description, quantity, unit_price, line_total")
        .eq("order_id", orderId).order("created_at", { ascending: true });
      const currentRows = invoiceRows(response.data);
      if (currentRows.length > 0) rows = currentRows;
    }
    if (rows.length > 0) result.menuItems = rows.map(menuInvoiceLineFromRow);
  }

  if (needsEquipment || options.preferCurrentOrderLines) {
    let rows = invoiceRows(quote?.equipment_items);
    if (rows.length === 0 || options.preferCurrentOrderLines) {
      const response = await supabase.from("equipment_bookings")
        .select("id, quantity, unit_price, equipment:equipment_id(name, rental_price, is_hire_in)")
        .eq("order_id", orderId).order("created_at", { ascending: true });
      const currentRows = invoiceRows(response.data);
      if (currentRows.length > 0) rows = currentRows;
    }
    if (rows.length > 0) result.equipmentItems = rows.map(equipmentInvoiceLineFromRow);
  }

  return result;
}
