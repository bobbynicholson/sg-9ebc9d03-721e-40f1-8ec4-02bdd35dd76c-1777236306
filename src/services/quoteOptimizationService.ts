import type { Quote } from "@/types";
import type { DiaryEntry } from "@/lib/quoteDiarySignal";
import { getCompanyEventCapacitySettings, type EventCapacitySettings } from "@/lib/eventCapacity";
import { loadQuoteDiary } from "@/services/quoteDiaryService";
import { planningWeek, shiftPlanningDate } from "@/lib/quotes/quoteOptimization";
import { isBookedPlanningOrder, type PlanningLead, type PlanningOrder } from "@/lib/quotes/quotePipeline";
import { isAutomatedTestOrder } from "@/lib/testDataDetection";

export interface QuoteOptimizationData {
  companyId: string;
  start: string;
  end: string;
  allUpcoming: boolean;
  quotes: Quote[];
  leads: PlanningLead[];
  relatedQuotes: Quote[];
  orders: PlanningOrder[];
  commitments: DiaryEntry[];
  capacity: EventCapacitySettings;
  catalogueCosts: Map<string, number>;
  loadedAt: string;
}

const quoteFields = "id, company_id, quote_number, quote_name, client_name, client_company_name, contact_name, client_email, client_phone, client_id, lead_id, region_id, event_date, event_time, event_type, setup_time, venue_address, venue_lat, venue_lng, notes, guest_count, status, subtotal, total_amount, total, tax_amount, tax, currency, delivery_fee, menu_items, equipment_items, valid_until, converted_to_order_id, deleted_at, updated_at";
const leadFields = "id, company_id, client_name, contact_name, client_email, email, client_phone, phone, event_date, guest_count, status, source, deleted_at, notes, converted_to_client_id, source_order_id, updated_at, region_id";

/** All pages are read within the authenticated company's RLS boundary.
 * The diary spans whole weeks so bookings outside the visible date window
 * still consume the weekly workload budget. */
export async function loadQuoteOptimizationData(db: any, companyId: string, start: string, end: string): Promise<QuoteOptimizationData> {
  if (!companyId) throw new Error("A company is required to build a quote plan.");
  const allUpcoming = end === "all";
  if (allUpcoming) {
    const latest = await Promise.all(["leads", "quotes", "orders"].map(async (table) => {
      const { data, error } = await db.from(table).select("event_date").eq("company_id", companyId).is("deleted_at", null)
        .gte("event_date", start).order("event_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data?.event_date || start;
    }));
    end = [...latest, shiftPlanningDate(start, 29)].sort().at(-1)!;
  }
  const pages = async <T,>(query: () => any): Promise<T[]> => {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await query().order("id").range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < 500) return rows;
    }
  };
  const windowFilter = `event_date.is.null,and(event_date.gte.${start},event_date.lte.${end})`;
  const orderFields = "id, quote_id, client_id, client_name, client_email, region_id, event_date, event_time, event_name, guest_count, status, total_amount, currency, deleted_at, order_number, updated_at, venue_name, venue_address, venue_lat, venue_lng";
  const [quotes, leads, windowOrders, diary, capacity] = await Promise.all([
    pages<Quote>(() => db.from("quotes").select(quoteFields).eq("company_id", companyId).is("deleted_at", null).or(windowFilter)),
    pages<PlanningLead>(() => db.from("leads").select(leadFields).eq("company_id", companyId).is("deleted_at", null).or(windowFilter)),
    pages<PlanningOrder>(() => db.from("orders").select(orderFields).eq("company_id", companyId).is("deleted_at", null)
      .gte("event_date", planningWeek(start)).lte("event_date", shiftPlanningDate(planningWeek(end), 6))),
    loadQuoteDiary(db, companyId, planningWeek(start), shiftPlanningDate(planningWeek(end), 6)),
    getCompanyEventCapacitySettings(db, companyId),
  ]);
  // Resolve links outside the window as well: moving an order must not leave
  // the old lead or accepted quote looking like an additional open enquiry.
  const relatedQuotes = new Map(quotes.map((quote) => [quote.id, quote]));
  const readLinkedQuotes = async (field: string, ids: string[]) => {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const rows = await pages<Quote>(() => db.from("quotes").select(quoteFields).eq("company_id", companyId).is("deleted_at", null)
        .in(field, ids.slice(offset, offset + 100)));
      rows.forEach((quote) => relatedQuotes.set(quote.id, quote));
    }
  };
  await Promise.all([
    readLinkedQuotes("lead_id", leads.map((lead) => lead.id)),
    readLinkedQuotes("client_id", [...new Set(leads.map((lead) => lead.converted_to_client_id).filter(Boolean))]),
    readLinkedQuotes("id", [...new Set(windowOrders.map((order) => order.quote_id).filter(Boolean))]),
  ]);
  const orders = new Map(windowOrders.map((order) => [order.id, order]));
  const quoteIds = [...relatedQuotes.keys()];
  const orderIds = [...new Set([...relatedQuotes.values()].map((quote) => quote.converted_to_order_id)
    .concat(leads.map((lead) => lead.source_order_id)).filter(Boolean))];
  const readLinkedOrders = async (field: string, ids: string[]) => {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const rows = await pages<PlanningOrder>(() => db.from("orders").select(orderFields).eq("company_id", companyId)
        .in(field, ids.slice(offset, offset + 100)));
      rows.forEach((order) => orders.set(order.id, order));
    }
  };
  await Promise.all([readLinkedOrders("id", orderIds), readLinkedOrders("quote_id", quoteIds)]);
  const orderRows = [...orders.values()].filter((order) => !isAutomatedTestOrder(order));
  const bookedOrderIds = new Set(orderRows.filter(isBookedPlanningOrder).map((order) => order.id));
  const commitments = diary.filter((entry) => entry.kind === "accepted_quote" || bookedOrderIds.has(entry.sourceId));
  const catalogueCosts = new Map<string, number>();
  const ids = [...new Set(quotes.flatMap((quote) => Array.isArray(quote.menu_items)
    ? quote.menu_items.map((line: any) => line?.menu_item_id).filter(Boolean) as string[] : []))];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await db.from("menu_items").select("id, cost_per_unit")
      .eq("company_id", companyId).in("id", ids.slice(offset, offset + 100));
    if (error) throw error;
    for (const row of data || []) {
      if (row.cost_per_unit != null && Number.isFinite(Number(row.cost_per_unit)) && Number(row.cost_per_unit) >= 0) {
        catalogueCosts.set(row.id, Number(row.cost_per_unit));
      }
    }
  }
  return { companyId, start, end, allUpcoming, quotes, leads, relatedQuotes: [...relatedQuotes.values()], orders: orderRows,
    commitments, capacity, catalogueCosts, loadedAt: new Date().toISOString() };
}
