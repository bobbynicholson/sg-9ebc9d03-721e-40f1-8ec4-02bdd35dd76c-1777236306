/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * orderSyncService -- keeps the quote, order and invoice in lock-step
 * when the operator edits an order.
 *
 * Why: the data model has three denormalised copies of the same
 * booking (quotes.menu_items + quote totals; orders.subtotal /
 * tax_amount / total_amount + order_items / equipment_bookings;
 * invoices.subtotal / tax_amount / total_amount). Changing the order
 * inline -- as the new Edit-mode UX lets you do -- has to fan back to
 * the source quote (so the customer-facing quote view shows the
 * change) and forward to the invoice (so accounting matches).
 *
 * Usage: call syncOrderArtifacts(orderId) after any inline order edit.
 * Idempotent + safe to spam.
 */
import { supabase as defaultSb } from "@/integrations/supabase/client";

const FALLBACK_TAX_RATE = 0.15; // SA VAT default

/**
 * Recompute totals from order_items + equipment_bookings, write them
 * back to the order, then push through to the linked quote (if any)
 * and the linked invoice (if any).
 *
 * Returns the freshly-computed totals so callers can update local
 * state without a refetch.
 */
export async function syncOrderArtifacts(
  orderId: string,
  client?: any,
): Promise<{
  ok: boolean;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  quote_id: string | null;
  invoice_id: string | null;
  error?: string;
}> {
  const sb = client || defaultSb;
  try {
    // 1. Pull the order + its line + equipment data.
    const [{ data: order }, { data: items }, { data: bookings }] = await Promise.all([
      sb.from("orders")
        .select("id, quote_id, company_id, subtotal, tax_amount, total_amount, client_name, venue_address, event_date, guest_count")
        .eq("id", orderId)
        .maybeSingle(),
      sb.from("order_items")
        .select("id, item_name, description, quantity, unit_price, line_total")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      sb.from("equipment_bookings")
        .select("id, equipment_id, quantity, booked_from, booked_until, equipment:equipment(name, daily_rate)")
        .eq("order_id", orderId),
    ]);

    if (!order) {
      return { ok: false, subtotal: 0, tax_amount: 0, total_amount: 0, quote_id: null, invoice_id: null, error: "order_not_found" };
    }

    // 2. Recompute subtotal. line_total wins if set (lets the operator
    //    override per-line); otherwise quantity * unit_price.
    const itemSubtotal = (items || []).reduce((sum: number, it: any) => {
      const explicit = Number(it.line_total || 0);
      if (explicit > 0) return sum + explicit;
      return sum + Number(it.quantity || 0) * Number(it.unit_price || 0);
    }, 0);

    const equipmentSubtotal = (bookings || []).reduce((sum: number, b: any) => {
      const eq = Array.isArray(b.equipment) ? b.equipment[0] : b.equipment;
      const dailyRate = Number(eq?.daily_rate || 0);
      const days = b.booked_from && b.booked_until
        ? Math.max(1, Math.round(
            (new Date(b.booked_until).getTime() - new Date(b.booked_from).getTime()) /
            (24 * 60 * 60 * 1000),
          ))
        : 1;
      return sum + Number(b.quantity || 0) * dailyRate * days;
    }, 0);

    const computedSubtotal = Number((itemSubtotal + equipmentSubtotal).toFixed(2));

    // 3. Derive tax rate from the order's existing tax_amount / subtotal
    //    so we preserve whatever was originally quoted (could be 0%
    //    for VAT-exempt clients, 15% for standard SA VAT, etc).
    const priorSubtotal = Number((order as any).subtotal || 0);
    const priorTax = Number((order as any).tax_amount || 0);
    const priorTotal = Number((order as any).total_amount || 0);

    let subtotal: number;
    let tax_amount: number;
    let total_amount: number;

    if (computedSubtotal > 0) {
      // Items + equipment cover the order -- recompute from them.
      const taxRate = priorSubtotal > 0 ? priorTax / priorSubtotal : FALLBACK_TAX_RATE;
      subtotal = computedSubtotal;
      tax_amount = Number((subtotal * taxRate).toFixed(2));
      total_amount = Number((subtotal + tax_amount).toFixed(2));
    } else {
      // Flat-price order with no line items / equipment to derive from
      // (typical when the quote captured a single negotiated price
      // rather than itemising). Preserve the existing totals so an
      // unrelated edit (guest count, venue, date) doesn't zero out
      // the order value.
      subtotal = priorSubtotal || priorTotal;
      tax_amount = priorTax;
      total_amount = priorTotal;
    }

    // 4. Update the order's totals.
    await sb.from("orders").update({
      subtotal,
      tax_amount,
      total_amount,
    } as any).eq("id", orderId);

    // 5. Mirror to the source quote, if any -- but only while the
    //    quote is still in flight. Once the client accepts, the quote
    //    becomes the contract snapshot of what was signed; subsequent
    //    operator edits live on the order + invoice only. Without this
    //    guard, partial writes (e.g. totals landing but a stale
    //    menu_items snapshot getting overwritten on the next sync)
    //    can desync the public /q/[token] view. Treating the accepted
    //    quote as immutable removes that whole class of bug.
    const quote_id: string | null = (order as any).quote_id || null;
    let quoteIsAccepted = false;
    if (quote_id) {
      const { data: quoteRow } = await sb
        .from("quotes")
        .select("status, accepted_at")
        .eq("id", quote_id)
        .maybeSingle();
      quoteIsAccepted =
        ((quoteRow as any)?.status === "accepted") ||
        !!(quoteRow as any)?.accepted_at;
    }
    if (quote_id && !quoteIsAccepted) {
      const menuItemsJsonb = (items || []).map((it: any) => ({
        id: it.id,
        name: it.item_name,
        description: it.description || null,
        quantity: Number(it.quantity || 0),
        pricePerPerson: Number(it.unit_price || 0),
        unit_price: Number(it.unit_price || 0),
        line_total: Number(it.line_total || (Number(it.quantity || 0) * Number(it.unit_price || 0))),
      }));
      const equipmentItemsJsonb = (bookings || []).map((b: any) => {
        const eq = Array.isArray(b.equipment) ? b.equipment[0] : b.equipment;
        return {
          id: b.equipment_id,
          name: eq?.name || "(equipment)",
          quantity: Number(b.quantity || 0),
          rentalPrice: Number(eq?.daily_rate || 0),
          booked_from: b.booked_from,
          booked_until: b.booked_until,
        };
      });

      await sb.from("quotes").update({
        client_name: (order as any).client_name,
        venue_address: (order as any).venue_address,
        event_date: (order as any).event_date,
        guest_count: (order as any).guest_count,
        menu_items: menuItemsJsonb,
        equipment_items: equipmentItemsJsonb,
        // Quotes have BOTH legacy + new total columns. Update both
        // so whichever the UI reads is correct.
        subtotal,
        tax_amount,
        tax: tax_amount,
        total_amount,
        total: total_amount,
      } as any).eq("id", quote_id);
    }

    // 6. Mirror to the invoice, if one exists. Invoices reference the
    //    order; we just push totals through.
    const { data: invoice } = await sb
      .from("invoices")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();

    let invoice_id: string | null = null;
    if (invoice) {
      invoice_id = (invoice as any).id;
      await sb.from("invoices").update({
        subtotal,
        tax_amount,
        total_amount,
      } as any).eq("id", invoice_id);
    }

    return { ok: true, subtotal, tax_amount, total_amount, quote_id, invoice_id };
  } catch (err: any) {
    console.error("[orderSyncService] sync failed:", err);
    return { ok: false, subtotal: 0, tax_amount: 0, total_amount: 0, quote_id: null, invoice_id: null, error: err?.message || "sync_failed" };
  }
}
