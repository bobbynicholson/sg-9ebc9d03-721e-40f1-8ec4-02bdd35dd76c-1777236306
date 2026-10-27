/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Quote + invoice for a duplicated order.
 *
 * A duplicate starts with no quote (the source quote belongs to the
 * source booking) and no invoice. Billing a rebooked event then left
 * the order with an invoice but no quote. This creates both straight
 * away:
 *   - an accepted quote tagged external_source = "order_duplicate",
 *     which keeps following order edits (see syncOrderArtifacts);
 *   - an unsent draft invoice. Nothing is emailed: the admin checks the
 *     new copy and sends it with "Send payment request".
 */
import { resolveDefaultRegionId } from "@/lib/defaultRegion";
import { fetchMenuCategories, sortByCourse } from "@/lib/menuCourses";

export const DUPLICATE_ORDER_QUOTE_SOURCE = "order_duplicate";

/**
 * Every quote column the tg_propagate_quote_edits_to_order trigger
 * copies back onto the order on a quote update. Writing them from the
 * current order makes that copy-back a no-op, so syncing the quote can
 * never overwrite the order (e.g. a stale discount or waiter rate).
 */
export function quoteMirrorFieldsFromOrder(order: any): Record<string, any> {
  return {
    event_date: order.event_date ?? null,
    event_time: order.event_time ?? null,
    setup_time: order.setup_time ?? null,
    guest_count: order.guest_count ?? null,
    venue_address: order.venue_address ?? null,
    venue_lat: order.venue_lat ?? null,
    venue_lng: order.venue_lng ?? null,
    client_name: order.client_name ?? null,
    client_email: order.client_email ?? null,
    client_phone: order.client_phone ?? null,
    client_company_name: order.client_company_name ?? null,
    quote_name: order.event_name || "Event",
    subtotal: Number(order.subtotal || 0),
    discount_amount: order.discount_amount ?? null,
    tax_amount: Number(order.tax_amount || 0),
    tax: order.tax ?? order.tax_amount ?? 0,
    total_amount: Number(order.total_amount || 0),
    total: Number(order.total_amount || 0),
    deposit_percentage: order.deposit_percentage ?? null,
    delivery_fee: order.delivery_fee ?? null,
    delivery_distance_km: order.delivery_distance_km ?? null,
    delivery_rate_per_km: order.delivery_rate_per_km ?? null,
    collection_fee: order.collection_fee ?? null,
    collection_distance_km: order.collection_distance_km ?? null,
    collection_rate_per_km: order.collection_rate_per_km ?? null,
    collection_next_day: order.collection_next_day ?? null,
    // A null order branch would blank the quote's; the trigger keeps it anyway.
    ...(order.region_id ? { region_id: order.region_id } : {}),
    waiter_service_required: order.waiter_service_required ?? null,
    waiter_count: order.waiter_count ?? null,
    waiter_duration_hours: order.waiter_duration_hours ?? null,
    waiter_hourly_rate: order.waiter_hourly_rate ?? null,
    waiter_total_fee: order.waiter_total_fee ?? null,
  };
}

/** Current order values for a quote that follows its order. */
export async function loadQuoteMirrorFields(sb: any, orderId: string): Promise<Record<string, any>> {
  const { data: order, error } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("order_not_found");
  return quoteMirrorFieldsFromOrder(order);
}

export interface DuplicateOrderDocumentsResult {
  quoteId: string | null;
  invoiceId: string | null;
  /** Plain-language problems for the admin; empty when both were created. */
  problems: string[];
}

export async function createDuplicateOrderDocuments(
  sb: any,
  orderId: string,
  sourceQuoteId: string | null,
): Promise<DuplicateOrderDocumentsResult> {
  const result: DuplicateOrderDocumentsResult = { quoteId: null, invoiceId: null, problems: [] };

  const { data: order, error: orderErr } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (orderErr || !order) {
    result.problems.push("The quote and invoice were not created because the new order could not be loaded.");
    return result;
  }

  try {
    result.quoteId = await createQuote(sb, order, sourceQuoteId);
  } catch (e: any) {
    console.error("[duplicateOrderDocuments] quote create failed:", { orderId, error: e?.message || e });
    result.problems.push(`The quote was not created (${e?.message || "unknown error"}).`);
  }

  try {
    const { ensureInvoiceForOrder } = await import("@/services/invoiceGenerationService");
    // force: a duplicate of an imported order still needs its invoice.
    // draft: nothing is emailed until the admin sends it.
    const invoice = await ensureInvoiceForOrder(orderId, order.company_id, sb, { force: true, draft: true });
    if (!invoice.success || !invoice.invoiceId) throw new Error(invoice.error || invoice.skipped || "no invoice returned");
    result.invoiceId = invoice.invoiceId;
  } catch (e: any) {
    console.error("[duplicateOrderDocuments] invoice create failed:", { orderId, error: e?.message || e });
    result.problems.push(`The invoice was not created (${e?.message || "unknown error"}).`);
  }

  return result;
}

async function createQuote(sb: any, order: any, sourceQuoteId: string | null): Promise<string> {
  let leadId: string | null = null;
  if (sourceQuoteId) {
    const { data: sourceQuote } = await sb.from("quotes").select("lead_id").eq("id", sourceQuoteId).maybeSingle();
    leadId = (sourceQuote as any)?.lead_id || null;
  }
  // quote_has_lead_or_client: a quote must belong to a client or a lead.
  if (!order.client_id && !leadId) throw new Error("the order has no client linked");

  const { data: quoteNumber, error: numErr } = await sb.rpc("consume_next_document_number", {
    p_company_id: order.company_id,
    p_document_type: "quote",
  });
  if (numErr || !quoteNumber) throw new Error(`no quote number: ${numErr?.message || "none returned"}`);

  const { data: items, error: itemsErr } = await sb
    .from("order_items")
    .select("id, menu_item_id, item_name, description, quantity, unit_price, line_total")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  if (itemsErr) throw itemsErr;
  const categoryById = await fetchMenuCategories(sb, (items || []).map((it: any) => it.menu_item_id));
  const menuItems = sortByCourse((items || []).map((it: any) => ({
    id: it.id,
    menu_item_id: it.menu_item_id ?? null,
    category: (it.menu_item_id && categoryById.get(it.menu_item_id)) || null,
    item_name: it.item_name,
    name: it.item_name,
    description: it.description || null,
    quantity: Number(it.quantity || 0),
    pricePerPerson: Number(it.unit_price || 0),
    unit_price: Number(it.unit_price || 0),
    line_total: Number(it.line_total || (Number(it.quantity || 0) * Number(it.unit_price || 0))),
  })), (it: any) => it.category);

  const now = new Date().toISOString();
  const { data: quote, error: insertErr } = await sb
    .from("quotes")
    .insert({
      ...quoteMirrorFieldsFromOrder(order),
      company_id: order.company_id,
      region_id: order.region_id ?? (await resolveDefaultRegionId(order.company_id)),
      client_id: order.client_id ?? null,
      lead_id: leadId,
      contact_name: order.client_name ?? null,
      quote_number: String(quoteNumber),
      currency: order.currency ?? null,
      equipment_return_method: order.equipment_return_method ?? null,
      menu_items: menuItems,
      // Equipment bookings are not copied by duplicateOrder.
      equipment_items: [],
      status: "accepted",
      accepted_at: now,
      converted_to_order_id: order.id,
      parent_quote_id: sourceQuoteId,
      external_source: DUPLICATE_ORDER_QUOTE_SOURCE,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  const quoteId = (quote as any).id as string;
  const { error: linkErr } = await sb.from("orders").update({ quote_id: quoteId }).eq("id", order.id);
  if (linkErr) throw new Error(`quote ${quoteNumber} created but not linked to the order: ${linkErr.message}`);
  return quoteId;
}
