/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * orderSyncService - keeps the quote, order and invoice in lock-step
 * when the operator edits an order.
 *
 * Why: the data model has three denormalised copies of the same
 * booking (quotes.menu_items + quote totals; orders.subtotal /
 * tax_amount / total_amount + order_items / equipment_bookings;
 * invoices.subtotal / tax_amount / total_amount). Changing the order
 * inline - as the new Edit-mode UX lets you do - has to fan back to
 * the source quote (so the customer-facing quote view shows the
 * change) and forward to the invoice (so accounting matches).
 *
 * Usage: call syncOrderArtifacts(orderId) after any inline order edit.
 * Idempotent + safe to spam.
 */
import { supabase as defaultSb } from "@/integrations/supabase/client";
import { breakdownFromLineSum } from "@/lib/vatMath";

const FALLBACK_TAX_RATE = 0.15; // SA VAT default

export function applyOrderValueDelta(
  priorComparableValue: number,
  priorBaseValue: number,
  currentBaseValue: number,
  priorDiscount: number,
  currentDiscount: number,
): number {
  return Number((
    priorComparableValue + currentBaseValue - priorBaseValue + priorDiscount - currentDiscount
  ).toFixed(2));
}

export async function syncInvoiceValuesFromOrder(
  orderId: string,
  client?: any,
): Promise<{ invoice_id: string | null; error?: string }> {
  const sb = client || defaultSb;
  try {
    const [{ data: order, error: orderErr }, { data: invoice, error: invoiceErr }] = await Promise.all([
      sb.from("orders")
        .select("subtotal, tax_amount, total_amount, client_name, client_email, client_phone, event_name, event_date, event_time, venue_address, guest_count")
        .eq("id", orderId)
        .maybeSingle(),
      sb.from("invoices")
        .select("id, invoice_data, amount_paid, status")
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);

    if (orderErr) throw orderErr;
    if (invoiceErr) throw invoiceErr;
    if (!order || !invoice) return { invoice_id: null };

    const amountPaid = Number((invoice as any).amount_paid || 0);
    const totalAmount = Number((order as any).total_amount || 0);
    const balanceDue = Math.max(0, Number((totalAmount - amountPaid).toFixed(2)));
    const previousStatus = String((invoice as any).status || "sent");
    const status = balanceDue < 0.01
      ? "paid"
      : previousStatus === "paid"
        ? amountPaid > 0 ? "partially_paid" : "sent"
        : previousStatus;
    const existingInvoiceData = (invoice as any).invoice_data && typeof (invoice as any).invoice_data === "object"
      ? (invoice as any).invoice_data
      : {};
    const updatedInvoiceData = {
      ...existingInvoiceData,
      subtotal: Number((order as any).subtotal || 0),
      taxAmount: Number((order as any).tax_amount || 0),
      total: totalAmount,
      depositPaid: amountPaid,
      balanceDue,
      clientName: (order as any).client_name ?? null,
      clientEmail: (order as any).client_email ?? null,
      clientPhone: (order as any).client_phone ?? null,
      eventName: (order as any).event_name ?? null,
      eventDate: (order as any).event_date ?? null,
      eventTime: (order as any).event_time ?? null,
      venue: (order as any).venue_address ?? null,
      venueAddress: (order as any).venue_address ?? null,
      guestCount: (order as any).guest_count ?? null,
    };
    const { error: updateErr } = await sb.from("invoices").update({
      subtotal: Number((order as any).subtotal || 0),
      tax_amount: Number((order as any).tax_amount || 0),
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      status,
      invoice_data: updatedInvoiceData as any,
      updated_at: new Date().toISOString(),
    } as any).eq("id", (invoice as any).id);
    if (updateErr) throw updateErr;

    return { invoice_id: (invoice as any).id };
  } catch (err: any) {
    return { invoice_id: null, error: err?.message || "invoice_sync_failed" };
  }
}

/**
 * Recompute totals from order_items + equipment_bookings using the
 * pre-edit base when supplied, preserving the agreed fee/discount
 * adjustment. Then update the order, linked quote, and invoice.
 *
 * Returns the freshly-computed totals so callers can update local
 * state without a refetch.
 */
export async function syncOrderArtifacts(
  orderId: string,
  client?: any,
  options?: { priorBaseSubtotal?: number; priorDiscountAmount?: number },
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
        .select("id, quote_id, company_id, subtotal, tax_amount, total_amount, discount_amount, client_name, venue_address, event_name, event_date, event_time, guest_count, companies:company_id(pricing_includes_vat)")
        .eq("id", orderId)
        .maybeSingle(),
      sb.from("order_items")
        .select("id, item_name, description, quantity, unit_price, line_total")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      sb.from("equipment_bookings")
        // Wave 30.2: equipment.daily_rate is the wrong column name --
        // the actual price column is rental_price. Same wrong name was
        // breaking the admin order drawer's Equipment tab; fixing here
        // means equipment subtotals on the quote sync now compute
        // correctly instead of always falling back to 0.
        .select("id, equipment_id, quantity, booked_from, booked_until, equipment:equipment(name, rental_price)")
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
      const dailyRate = Number(eq?.rental_price || 0);
      const days = b.booked_from && b.booked_until
        ? Math.max(1, Math.round(
            (new Date(b.booked_until).getTime() - new Date(b.booked_from).getTime()) /
            (24 * 60 * 60 * 1000),
          ))
        : 1;
      return sum + Number(b.quantity || 0) * dailyRate * days;
    }, 0);

    const computedBase = Number((itemSubtotal + equipmentSubtotal).toFixed(2));

    // 3. Derive tax rate from the order's existing tax_amount / subtotal
    //    so we preserve whatever was originally quoted (could be 0%
    //    for VAT-exempt clients, 15% for standard SA VAT, etc).
    const priorSubtotal = Number((order as any).subtotal || 0);
    const priorTax = Number((order as any).tax_amount || 0);
    const priorTotal = Number((order as any).total_amount || 0);
    const incVat = (order as any)?.companies?.pricing_includes_vat === true;
    const priorBase = options?.priorBaseSubtotal ?? computedBase;
    const priorDiscount = options?.priorDiscountAmount ?? Number((order as any).discount_amount || 0);
    const currentDiscount = Number((order as any).discount_amount || 0);
    const priorComparable = incVat ? priorTotal : priorSubtotal;
    const computedSubtotal = applyOrderValueDelta(
      priorComparable,
      priorBase,
      computedBase,
      priorDiscount,
      currentDiscount,
    );

    let subtotal: number;
    let tax_amount: number;
    let total_amount: number;

    if (computedSubtotal > 0) {
      // Items + equipment cover the order - recompute from them.
      // Derive the tax rate from the order's prior totals so a quote
      // signed at a non-standard rate (zero-rated export, exempt
      // client, etc.) keeps that rate.
      const priorRate = priorSubtotal > 0 ? priorTax / priorSubtotal : FALLBACK_TAX_RATE;
      // Honour the tenant's pricing convention. If they store prices
      // inc-VAT, computedSubtotal IS the gross and we derive ex-VAT
      // by dividing back. Otherwise VAT is added on top.
      const breakdown = breakdownFromLineSum(
        computedSubtotal,
        priorRate,
        incVat ? "inc" : "ex",
      );
      subtotal = breakdown.net;
      tax_amount = breakdown.vat;
      total_amount = breakdown.gross;
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
    const { error: totalsUpdateErr } = await sb.from("orders").update({
      subtotal,
      tax_amount,
      total_amount,
    } as any).eq("id", orderId);
    if (totalsUpdateErr) throw totalsUpdateErr;

    // 5. Mirror to the source quote, if any - but only while the
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
      const { data: quoteRow, error: quoteRowErr } = await sb
        .from("quotes")
        .select("status, accepted_at")
        .eq("id", quote_id)
        .maybeSingle();
      if (quoteRowErr) {
        console.error("[order/orderSyncService] quotes fetch failed:", quoteRowErr);
      }
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
          rentalPrice: Number(eq?.rental_price || 0),
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

    // 6. Mirror current financial + event values to the invoice while
    // preserving every saved menu/equipment line in its invoice snapshot.
    const invoiceSync = await syncInvoiceValuesFromOrder(orderId, sb);
    if (invoiceSync.error) throw new Error(invoiceSync.error);
    const invoice_id = invoiceSync.invoice_id;

    return { ok: true, subtotal, tax_amount, total_amount, quote_id, invoice_id };
  } catch (err: any) {
    console.error("[orderSyncService] sync failed:", err);
    return { ok: false, subtotal: 0, tax_amount: 0, total_amount: 0, quote_id: null, invoice_id: null, error: err?.message || "sync_failed" };
  }
}
