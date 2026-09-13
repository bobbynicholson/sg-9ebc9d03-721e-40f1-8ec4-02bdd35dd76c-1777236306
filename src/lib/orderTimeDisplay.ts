/** Shared display rules for the three distinct operational times on an order. */

export const DEFAULT_DELIVERY_LEAD_MINUTES = 60;

export function parseOrderTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/** Delivery is the venue-arrival target, not setup_time or post-event collection_time. */
export function getDisplayDeliveryMinutes(
  deliveryTime: string | null | undefined,
  eventTime: string | null | undefined,
  leadMinutes = DEFAULT_DELIVERY_LEAD_MINUTES,
): number | null {
  const explicit = parseOrderTime(deliveryTime);
  if (explicit != null) return explicit;
  const eventMinutes = parseOrderTime(eventTime);
  return eventMinutes == null ? null : eventMinutes - leadMinutes;
}

export function formatOrderMinutes(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const normalized = (minutes + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function getDisplayDeliveryTime(
  deliveryTime: string | null | undefined,
  eventTime: string | null | undefined,
  leadMinutes = DEFAULT_DELIVERY_LEAD_MINUTES,
): string | null {
  return formatOrderMinutes(getDisplayDeliveryMinutes(deliveryTime, eventTime, leadMinutes));
}
