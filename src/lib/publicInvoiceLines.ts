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

/**
 * Bookings usually carry no unit_price; without the quote they fell back
 * to the catalogue rental price, so the invoice showed a different price
 * (and line total) from the agreed quote. Take the quoted price for the
 * same item (by equipment id, then name) when the booking has none.
 */
/** The order's quote equipment lines (agreed prices), loaded only when needed. */
async function quotedEquipmentLines(
  supabase: QueryClient,
  orderId: string,
  quoteId: string | null | undefined,
  quote: Record<string, any> | null,
): Promise<Record<string, any>[]> {
  if (quote) return invoiceRows(quote.equipment_items);
  let id = quoteId || null;
  if (!id) {
    const response = await supabase.from("orders").select("quote_id").eq("id", orderId).maybeSingle();
    id = response.data?.quote_id || null;
  }
  if (!id) return [];
  const response = await supabase.from("quotes").select("equipment_items").eq("id", id).maybeSingle();
  return invoiceRows(response.data?.equipment_items);
}

export function withQuotedEquipmentPrices(bookings: Record<string, any>[], quoteLines: Record<string, any>[]) {
  if (quoteLines.length === 0) return bookings;
  const priceOf = (line: Record<string, any>) => {
    for (const value of [line.unit_price, line.unitPrice, line.rentalPrice, line.rental_price]) {
      if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) return Number(value);
    }
    return null;
  };
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const line of quoteLines) {
    const price = priceOf(line);
    if (price === null) continue;
    if (line.equipment_id) byId.set(String(line.equipment_id), price);
    const name = String(line.name || line.equipment_name || line.description || "").trim().toLowerCase();
    if (name) byName.set(name, price);
  }
  return bookings.map((row) => {
    if (row.unit_price !== null && row.unit_price !== undefined && row.unit_price !== "") return row;
    const equipment = (Array.isArray(row.equipment) ? row.equipment[0] : row.equipment) || {};
    const quoted = byId.get(String(row.equipment_id)) ?? byName.get(String(equipment.name || "").trim().toLowerCase());
    return quoted === undefined ? row : { ...row, unit_price: quoted };
  });
}

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
      // Cancelled bookings (e.g. 25cm plates swapped for 20cm) are not on
      // the order any more and must not appear on the invoice.
      const response = await supabase.from("equipment_bookings")
        .select("id, equipment_id, quantity, unit_price, equipment:equipment_id(name, rental_price, is_hire_in)")
        .eq("order_id", orderId).neq("status", "cancelled").order("created_at", { ascending: true });
      const currentRows = withQuotedEquipmentPrices(invoiceRows(response.data), await quotedEquipmentLines(supabase, orderId, quoteId, quote));
      if (currentRows.length > 0) rows = currentRows;
    }
    if (rows.length > 0) result.equipmentItems = rows.map(equipmentInvoiceLineFromRow);
  }

  return result;
}
