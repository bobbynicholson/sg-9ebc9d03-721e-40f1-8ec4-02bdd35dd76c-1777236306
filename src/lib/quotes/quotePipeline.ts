import type { Quote } from "@/types";
import type { Database } from "@/integrations/supabase/types";
import { BOOKED_ORDER_STATUSES, type EventCapacitySettings } from "@/lib/eventCapacity";
import type { DiaryEntry } from "@/lib/quoteDiarySignal";
import { toLocalDateKey } from "@/lib/localDate";
import { hasAutomatedTestMarker, isAutomatedTestOrder, isAutomatedTestQuote } from "@/lib/testDataDetection";
import { opportunityGroup, type Opportunity } from "@/lib/quotes/quoteOptimization";

export type PlanningLead = Database["public"]["Tables"]["leads"]["Row"];
export type PlanningOrder = Pick<Database["public"]["Tables"]["orders"]["Row"],
  "id" | "quote_id" | "client_id" | "client_name" | "client_email" | "region_id" | "event_date" | "event_time" | "event_name" | "guest_count" | "status" | "total_amount" | "currency" | "deleted_at" | "order_number" | "updated_at" | "venue_name" | "venue_address" | "venue_lat" | "venue_lng">;
export type PipelineState = "accepted" | "pending" | "review" | "closed";
export interface PipelineEntry {
  key: string;
  date: string | null;
  label: string;
  regionId: string | null;
  guests: number | null;
  state: PipelineState;
  reasons: string[];
  leads: PlanningLead[];
  quotes: Quote[];
  order?: PlanningOrder;
  source: string;
  duplicateGroup?: string;
  duplicatePeers?: string[];
}
export interface PipelineDay {
  date: string | null;
  entries: PipelineEntry[];
  accepted: number;
  pending: number;
  review: number;
  closed: number;
  awaitingDecision: number;
}
const bookedStatuses = new Set<string>(BOOKED_ORDER_STATUSES);
const closedOrders = new Set(["cancelled", "canceled", "rejected"]);
const closedQuotes = new Set(["rejected", "expired", "lost", "cancelled", "canceled"]);
const amount = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function isBookedPlanningOrder(order: PlanningOrder): boolean {
  return !order.deleted_at && bookedStatuses.has(order.status);
}
export function summarizePipelineDay(entries: PipelineEntry[], date: string | null): PipelineDay {
  const rows = entries.filter((entry) => entry.date === date);
  const count = (state: PipelineState) => rows.filter((entry) => entry.state === state).length;
  return { date, entries: rows, accepted: count("accepted"), pending: count("pending"), review: count("review"),
    closed: count("closed"), awaitingDecision: count("pending") + count("review") };
}

/** Count commercial enquiries once, even when intake produced a lead, quote
 * and order. Orders own the date and lifecycle after conversion. */
export function buildQuotePipeline({ leads, quotes, orders, commitments, opportunities, start, end, regionId, currency }: {
  leads: PlanningLead[]; quotes: Quote[]; orders: PlanningOrder[]; commitments: DiaryEntry[];
  opportunities: Opportunity[]; start: string; end: string; regionId?: string | null; currency: string;
}): PipelineEntry[] {
  const usableLeads = leads.filter((lead) => !lead.deleted_at && !hasAutomatedTestMarker(lead.client_name, lead.contact_name, lead.client_email, lead.notes));
  const usableQuotes = quotes.filter((quote) => !quote.deleted_at && !isAutomatedTestQuote(quote));
  const usableOrders = orders.filter((order) => !isAutomatedTestOrder(order));
  const ready = new Set(opportunities.map((opportunity) => opportunity.id));
  const leadById = new Map(usableLeads.map((lead) => [lead.id, lead]));
  const clientLeads = new Map<string, PlanningLead[]>();
  for (const lead of usableLeads) if (lead.converted_to_client_id) clientLeads.set(lead.converted_to_client_id,
    [...(clientLeads.get(lead.converted_to_client_id) || []), lead]);
  const leadsForQuote = (quote: Quote) => {
    if (quote.lead_id && leadById.has(quote.lead_id)) return [leadById.get(quote.lead_id)!];
    return quote.client_id ? (clientLeads.get(quote.client_id) || []).filter((lead) => !lead.event_date || lead.event_date === quote.event_date) : [];
  };
  const quoteById = new Map(usableQuotes.map((quote) => [quote.id, quote]));
  const quotesByOrder = new Map<string, Quote[]>();
  for (const quote of usableQuotes) if (quote.converted_to_order_id) quotesByOrder.set(quote.converted_to_order_id,
    [...(quotesByOrder.get(quote.converted_to_order_id) || []), quote]);
  const leadsByOrder = new Map<string, PlanningLead[]>();
  const leadsByClientDate = new Map<string, PlanningLead[]>();
  for (const lead of usableLeads) {
    if (lead.source_order_id) leadsByOrder.set(lead.source_order_id, [...(leadsByOrder.get(lead.source_order_id) || []), lead]);
    if (lead.converted_to_client_id && lead.event_date) {
      const key = `${lead.converted_to_client_id}|${lead.event_date}`;
      leadsByClientDate.set(key, [...(leadsByClientDate.get(key) || []), lead]);
    }
  }
  const acceptedQuoteIds = new Set(commitments.filter((entry) => entry.kind === "accepted_quote").map((entry) => entry.quoteId || entry.sourceId));
  const orderById = new Map(usableOrders.map((order) => [order.id, order]));
  const orderByQuote = new Map<string, PlanningOrder>();
  for (const order of usableOrders) if (order.quote_id) {
    const previous = orderByQuote.get(order.quote_id);
    if (!previous || (previous.deleted_at && !order.deleted_at) || (!isBookedPlanningOrder(previous) && isBookedPlanningOrder(order))) orderByQuote.set(order.quote_id, order);
  }
  const rows = new Map<string, PipelineEntry>();
  const attachedLeads = new Set<string>();
  const attachLeads = (row: PipelineEntry, attached: PlanningLead[]) => {
    for (const lead of attached) {
      attachedLeads.add(lead.id);
      if (!row.leads.some((existing) => existing.id === lead.id)) row.leads.push(lead);
    }
  };
  for (const order of usableOrders) {
    const directQuote = order.quote_id ? quoteById.get(order.quote_id) : null;
    const linkedQuotes = [...new Map([...(quotesByOrder.get(order.id) || []), ...(directQuote ? [directQuote] : [])].map((quote) => [quote.id, quote])).values()];
    const linkedLeads = [...linkedQuotes.flatMap(leadsForQuote), ...(leadsByOrder.get(order.id) || []), ...(leadsByClientDate.get(`${order.client_id}|${order.event_date}`) || [])];
    const accepted = isBookedPlanningOrder(order);
    const closed = !!order.deleted_at || closedOrders.has(order.status);
    const row: PipelineEntry = { key: `order:${order.id}`, date: toLocalDateKey(order.event_date),
      label: order.client_name || directQuote?.client_name || "Booking", regionId: order.region_id,
      guests: amount(order.guest_count), state: accepted ? "accepted" : closed ? "closed" : "review",
      reasons: !accepted && !closed ? ["Order is awaiting confirmation; it is not counted as accepted capacity."] : [],
      leads: [], quotes: linkedQuotes, order, source: "order" };
    attachLeads(row, linkedLeads); rows.set(row.key, row);
  }
  for (const quote of usableQuotes) {
    // Follow authoritative order linkage even when its date moved outside the window.
    if ((quote.converted_to_order_id && orderById.has(quote.converted_to_order_id)) || orderByQuote.has(quote.id)) continue;
    const linkedLeads = leadsForQuote(quote);
    const date = toLocalDateKey(quote.event_date);
    const key = linkedLeads.length ? `lead:${linkedLeads[0].id}:${date || "undated"}` : `quote:${opportunityGroup(quote, date || "undated")}`;
    const existing = rows.get(key);
    if (existing) { existing.quotes.push(quote); attachLeads(existing, linkedLeads); continue; }
    const row: PipelineEntry = { key, date, label: quote.client_name || quote.quote_name || "Quote",
      regionId: quote.region_id, guests: amount(quote.guest_count), state: "review", reasons: [],
      leads: [], quotes: [quote], source: linkedLeads[0]?.source || "quote" };
    attachLeads(row, linkedLeads); rows.set(key, row);
  }
  for (const row of rows.values()) if (!row.order) {
    const accepted = row.quotes.find((quote) => quote.status === "accepted" && !quote.converted_to_order_id
      && acceptedQuoteIds.has(quote.id));
    const open = row.quotes.filter((quote) => !closedQuotes.has(quote.status));
    if (accepted) { row.state = "accepted"; row.guests = amount(accepted.guest_count); continue; }
    if (!open.length && (!row.leads.length || row.leads.every((lead) => lead.status === "lost"))) { row.state = "closed"; continue; }
    const eligible = open.filter((quote) => ready.has(quote.id));
    row.state = eligible.some((quote) => quote.status !== "draft") ? "pending" : "review";
    if (!row.date) row.reasons.push("Event date is missing.");
    if (!row.guests) row.reasons.push("Guest count is missing.");
    if (!open.length) row.reasons.push("Previous quote is closed; verify whether a new quote is needed.");
    if (open.some((quote) => quote.status === "draft")) row.reasons.push("Draft quote needs staff review before sending.");
    if (open.length && !eligible.length) {
      if (open.some((quote) => !amount(quote.subtotal))) row.reasons.push("Quote pricing needs to be completed.");
      if (open.some((quote) => quote.currency && quote.currency.toUpperCase() !== currency.toUpperCase())) row.reasons.push("Quote currency differs from the planning currency.");
      if (open.some((quote) => quote.valid_until && quote.valid_until.slice(0, 10) < start)) row.reasons.push("Quote validity has lapsed; review or revise it.");
      if (open.some((quote) => quote.converted_to_order_id)) row.reasons.push("Linked order could not be verified; review the booking.");
      if (!row.reasons.length) row.reasons.push("Quote needs verification before it can be optimized.");
    }
  }
  for (const lead of usableLeads) {
    if (attachedLeads.has(lead.id)) continue;
    const lost = String(lead.status) === "lost";
    const row: PipelineEntry = { key: `lead:${lead.id}`, date: toLocalDateKey(lead.event_date),
      label: lead.client_name || lead.contact_name || "Incoming enquiry", regionId: lead.region_id,
      guests: amount(lead.guest_count), state: lost ? "closed" : "review", quotes: [], leads: [lead], source: lead.source || "enquiry",
      reasons: lost ? [] : ["Enquiry needs a priced quote before profitability can be compared.",
        ...(!lead.event_date ? ["Event date is missing."] : []), ...(!amount(lead.guest_count) ? ["Guest count is missing."] : []),
        ...(["won", "converted"].includes(String(lead.status)) ? ["Marked won, but no accepted booking has been verified."] : [])] };
    rows.set(row.key, row);
  }
  const result = [...rows.values()].filter((row) => (!row.date || (row.date >= start && row.date <= end))
    && (!regionId || row.regionId === regionId || (row.state === "accepted" && !row.order)))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.label.localeCompare(b.label));
  // A matching contact/date is a review cue, not proof that two separately
  // accepted orders are the same booking. Never release their capacity here.
  const duplicateGroups = new Map<string, PipelineEntry[]>();
  const normalized = (value: string | null | undefined) => (value || "").trim().toLowerCase();
  for (const row of result) {
    if (row.state === "closed" || !row.date) continue;
    const email = normalized(row.leads[0]?.client_email || row.leads[0]?.email || row.quotes[0]?.client_email || row.order?.client_email);
    const phone = (row.leads[0]?.client_phone || row.leads[0]?.phone || row.quotes[0]?.client_phone || "").replace(/\D/g, "");
    const client = row.order?.client_id || row.quotes[0]?.client_id || row.leads[0]?.converted_to_client_id;
    const identity = email ? `email:${email}` : phone.length >= 7 ? `phone:${phone}` : client ? `client:${client}` : null;
    if (!identity) continue;
    const key = `${row.date}|${identity}`;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), row]);
  }
  for (const [key, group] of duplicateGroups) if (group.length > 1) for (const row of group) {
    row.duplicateGroup = key;
    row.duplicatePeers = group.filter((other) => other.key !== row.key).map((other) => other.key);
  }
  return result;
}

export function pipelineCapacity(day: PipelineDay, commitments: DiaryEntry[], capacity: EventCapacitySettings, selected: Opportunity[] = []) {
  const booked = commitments.filter((entry) => entry.date === day.date);
  const proposed = selected.filter((opportunity) => opportunity.date === day.date);
  const knownGuests = booked.reduce((sum, entry) => sum + (amount(entry.guests) || 0), 0);
  const unknownGuests = booked.some((entry) => !amount(entry.guests));
  return { booked: booked.length, bookedGuests: knownGuests, unknownGuests,
    remainingEvents: Math.max(0, capacity.maxConcurrentEvents - booked.length),
    remainingGuests: unknownGuests || capacity.maxKitchenLoadPerDay == null ? null : Math.max(0, capacity.maxKitchenLoadPerDay - knownGuests),
    afterPlanEvents: Math.max(0, capacity.maxConcurrentEvents - booked.length - proposed.length) };
}

export function pipelineDaySignature(day: PipelineDay): string {
  return JSON.stringify(day.entries.map((entry) => ({ key: entry.key, state: entry.state, date: entry.date, guests: entry.guests,
    reasons: entry.reasons, leads: entry.leads.map((lead) => [lead.id, lead.status, lead.updated_at]).sort(),
    quotes: entry.quotes.map((quote) => [quote.id, quote.status, quote.updated_at]).sort(),
    order: entry.order ? [entry.order.id, entry.order.status, entry.order.updated_at] : null,
  })).sort((a, b) => a.key.localeCompare(b.key)));
}
