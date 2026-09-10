import { isAutomatedTestOrder, isAutomatedTestQuote } from "@/lib/testDataDetection";

export const DEFAULT_MAX_CONCURRENT_EVENTS = 5;

export const BOOKED_ORDER_STATUSES = [
  "confirmed",
  "preparing",
  "ready",
  "in_transit",
  "delivered",
  "completed",
] as const;

export const OPEN_QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "revised",
  "pending",
] as const;

export type EventCapacityStatus = "available" | "at_capacity" | "over_capacity";

export interface EventCapacityCheck {
  maxConcurrentEvents: number;
  maxGuestsPerEvent: number | null;
  maxKitchenLoadPerDay: number | null;
  bookedOrders: number;
  projectedOrders: number;
  openQuotes: number;
  bookedGuests: number;
  candidateGuests: number;
  projectedKitchenLoad: number;
  remainingSlots: number;
  remainingKitchenLoad: number | null;
  limitReasons: string[];
  status: EventCapacityStatus;
  blocksPublicAcceptance: boolean;
}

interface CapacityArgs {
  companyId: string;
  eventDate: string;
  includeOpenQuotes?: boolean;
  excludeQuoteId?: string | null;
  candidateEventCount?: number;
  candidateGuestCount?: number | null;
}

function readPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function resolveMaxConcurrentEvents(dispatchSettings: unknown): number {
  const raw = (dispatchSettings || {}) as Record<string, unknown>;
  return (
    readPositiveInt(raw.maxConcurrentEvents) ??
    readPositiveInt(raw.max_concurrent_events) ??
    readPositiveInt(raw.max_events_per_day) ??
    DEFAULT_MAX_CONCURRENT_EVENTS
  );
}

export interface EventCapacitySettings {
  maxConcurrentEvents: number;
  maxGuestsPerEvent: number | null;
  maxKitchenLoadPerDay: number | null;
}

export function resolveEventCapacitySettings(dispatchSettings: unknown): EventCapacitySettings {
  const raw = (dispatchSettings || {}) as Record<string, unknown>;
  return {
    maxConcurrentEvents: resolveMaxConcurrentEvents(raw),
    maxGuestsPerEvent:
      readPositiveInt(raw.maxGuestsPerEvent) ??
      readPositiveInt(raw.max_guests_per_event),
    maxKitchenLoadPerDay:
      readPositiveInt(raw.maxKitchenLoadPerDay) ??
      readPositiveInt(raw.max_kitchen_load_per_day) ??
      readPositiveInt(raw.maxKitchenGuestsPerDay) ??
      readPositiveInt(raw.max_kitchen_guests_per_day),
  };
}

export async function getCompanyEventCapacitySettings(db: any, companyId: string): Promise<EventCapacitySettings> {
  const { data, error } = await db
    .from("companies")
    .select("dispatch_settings")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw error;
  return resolveEventCapacitySettings((data as any)?.dispatch_settings);
}

export async function getCompanyMaxConcurrentEvents(db: any, companyId: string): Promise<number> {
  return (await getCompanyEventCapacitySettings(db, companyId)).maxConcurrentEvents;
}

export async function getEventCapacityForDate(
  db: any,
  {
    companyId,
    eventDate,
    includeOpenQuotes = true,
    excludeQuoteId = null,
    candidateEventCount = 0,
    candidateGuestCount = null,
  }: CapacityArgs,
): Promise<EventCapacityCheck> {
  if (!companyId || !eventDate) {
    return {
      maxConcurrentEvents: DEFAULT_MAX_CONCURRENT_EVENTS,
      maxGuestsPerEvent: null,
      maxKitchenLoadPerDay: null,
      bookedOrders: 0,
      projectedOrders: 0,
      openQuotes: 0,
      bookedGuests: 0,
      candidateGuests: 0,
      projectedKitchenLoad: 0,
      remainingSlots: DEFAULT_MAX_CONCURRENT_EVENTS,
      remainingKitchenLoad: null,
      limitReasons: [],
      status: "available",
      blocksPublicAcceptance: false,
    };
  }

  const settings = await getCompanyEventCapacitySettings(db, companyId);
  const candidateGuests = Math.max(0, Math.round(Number(candidateGuestCount || 0)));
  const ordersQuery = db
    .from("orders")
    .select("id, status, guest_count, order_number, event_name, internal_notes, client_name")
    .eq("company_id", companyId)
    .eq("event_date", eventDate)
    .is("deleted_at", null)
    .in("status", [...BOOKED_ORDER_STATUSES]);

  const quotesQuery = includeOpenQuotes
    ? db
        .from("quotes")
        .select("id, status, guest_count, quote_number, quote_name, notes, client_name")
        .eq("company_id", companyId)
        .eq("event_date", eventDate)
        .is("deleted_at", null)
        .not("status", "in", "(accepted,rejected,expired)")
    : Promise.resolve({ data: [], error: null });

  const [ordersRes, quotesRes] = await Promise.all([ordersQuery, quotesQuery]);
  if (ordersRes.error) throw ordersRes.error;
  if (quotesRes.error) throw quotesRes.error;

  const bookedOrders = ((ordersRes.data || []) as any[])
    .filter((order) => !isAutomatedTestOrder(order));
  const openQuotes = ((quotesRes.data || []) as any[])
    .filter((quote) => quote.id !== excludeQuoteId)
    .filter((quote) => !isAutomatedTestQuote(quote));
  const bookedOrderCount = bookedOrders.length;
  const openQuoteCount = openQuotes.length;
  const bookedGuests = bookedOrders.reduce((sum, order) => {
    const guests = Math.max(0, Math.round(Number((order as any).guest_count || 0)));
    return sum + guests;
  }, 0);
  const projectedOrders = bookedOrderCount + Math.max(0, Math.round(Number(candidateEventCount || 0)));
  const projectedKitchenLoad = bookedGuests + candidateGuests;
  const remainingSlots = Math.max(0, settings.maxConcurrentEvents - bookedOrderCount);
  const remainingKitchenLoad = settings.maxKitchenLoadPerDay != null
    ? Math.max(0, settings.maxKitchenLoadPerDay - bookedGuests)
    : null;
  const limitReasons: string[] = [];

  if (projectedOrders > settings.maxConcurrentEvents) {
    limitReasons.push(
      `${bookedOrderCount} confirmed event${bookedOrderCount === 1 ? "" : "s"} already booked; accepting this would exceed the max of ${settings.maxConcurrentEvents}`,
    );
  }
  if (settings.maxGuestsPerEvent != null && candidateGuests > settings.maxGuestsPerEvent) {
    limitReasons.push(
      `${candidateGuests} guests exceeds the per-event max of ${settings.maxGuestsPerEvent}`,
    );
  }
  if (settings.maxKitchenLoadPerDay != null && projectedKitchenLoad > settings.maxKitchenLoadPerDay) {
    limitReasons.push(
      `${projectedKitchenLoad} total guests/kitchen units would exceed the daily kitchen capacity of ${settings.maxKitchenLoadPerDay}`,
    );
  }

  const status: EventCapacityStatus =
    limitReasons.length > 0 || bookedOrderCount > settings.maxConcurrentEvents
      ? "over_capacity"
      : bookedOrderCount >= settings.maxConcurrentEvents ||
          (settings.maxKitchenLoadPerDay != null && bookedGuests >= settings.maxKitchenLoadPerDay) ||
          (settings.maxGuestsPerEvent != null && candidateGuests >= settings.maxGuestsPerEvent && candidateGuests > 0)
        ? "at_capacity"
        : "available";

  return {
    maxConcurrentEvents: settings.maxConcurrentEvents,
    maxGuestsPerEvent: settings.maxGuestsPerEvent,
    maxKitchenLoadPerDay: settings.maxKitchenLoadPerDay,
    bookedOrders: bookedOrderCount,
    projectedOrders,
    openQuotes: openQuoteCount,
    bookedGuests,
    candidateGuests,
    projectedKitchenLoad,
    remainingSlots,
    remainingKitchenLoad,
    limitReasons,
    status,
    blocksPublicAcceptance: limitReasons.length > 0,
  };
}

export function publicCapacityMessage(companyName?: string | null): string {
  const owner = companyName?.trim() || "the caterer";
  return `This date or event size is no longer available. Please request a new date, adjust the guest count, or contact ${owner} before accepting.`;
}
