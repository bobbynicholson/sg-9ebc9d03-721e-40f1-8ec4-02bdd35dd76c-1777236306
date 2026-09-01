import type {
  QuotePdfData,
  QuotePdfEquipmentItem,
  QuotePdfMenuItem,
} from "./QuoteDocument";

const asArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function normaliseQuoteMenuItems(
  rawItems: unknown,
  guestCount?: number | null,
): QuotePdfMenuItem[] {
  const fallbackGuestCount = Number(guestCount || 0);

  return asArray(rawItems)
    .map((item, index): QuotePdfMenuItem | null => {
      const name = firstString(
        item?.name,
        item?.item_name,
        item?.title,
        item?.menu_item_name,
      ) || `Item ${index + 1}`;
      const unitPrice = firstNumber(
        item?.unit_price,
        item?.unitPrice,
        item?.pricePerPerson,
        item?.price_per_person,
        item?.base_price,
        item?.price,
      ) ?? 0;
      const mode = String(item?.pricing_mode ?? item?.pricingMode ?? "").toLowerCase();
      const rawQty = firstNumber(item?.quantity, item?.qty);
      const quantity =
        rawQty && rawQty > 0
          ? rawQty
          : mode.includes("flat")
            ? 1
            : fallbackGuestCount > 0
              ? fallbackGuestCount
              : 1;
      const explicitTotal = firstNumber(
        item?.total,
        item?.line_total,
        item?.lineTotal,
        item?.amount,
      );
      const discountPct = firstNumber(item?.discount_pct, item?.discountPct) ?? 0;
      const computedTotal = round2(Math.max(0, quantity * unitPrice * (1 - discountPct / 100)));

      return {
        name,
        description: firstString(item?.description, item?.category),
        unit_price: unitPrice,
        quantity,
        total: explicitTotal ?? computedTotal,
      };
    })
    .filter((item): item is QuotePdfMenuItem => !!item);
}

export function normaliseQuoteEquipmentItems(rawItems: unknown): QuotePdfEquipmentItem[] {
  return asArray(rawItems)
    .map((item, index): QuotePdfEquipmentItem | null => {
      const name = firstString(
        item?.name,
        item?.item_name,
        item?.equipment_name,
        item?.title,
      ) || `Equipment ${index + 1}`;
      const quantity = firstNumber(item?.quantity, item?.qty) ?? 1;
      const unitPrice = firstNumber(
        item?.unit_price,
        item?.unitPrice,
        item?.rentalPrice,
        item?.rental_price,
        item?.price,
      ) ?? 0;
      const explicitTotal = firstNumber(
        item?.total,
        item?.line_total,
        item?.lineTotal,
        item?.amount,
      );

      return {
        name,
        quantity,
        unit_price: unitPrice,
        total: explicitTotal ?? round2(Math.max(0, quantity * unitPrice)),
      };
    })
    .filter((item): item is QuotePdfEquipmentItem => !!item);
}

export function buildQuotePdfDataFromRow(row: any): QuotePdfData {
  const guestCount = firstNumber(row?.guest_count);
  return {
    quote_number: row?.quote_number || row?.id || "Quote",
    quote_name: row?.quote_name ?? null,
    client_name: row?.client_name ?? null,
    event_date: row?.event_date ?? null,
    event_time: row?.event_time ?? null,
    setup_time: row?.setup_time ?? null,
    guest_count: guestCount,
    venue_address: row?.venue_address ?? null,
    menu_items: normaliseQuoteMenuItems(row?.menu_items, guestCount),
    equipment_items: normaliseQuoteEquipmentItems(row?.equipment_items),
    subtotal: firstNumber(row?.subtotal),
    delivery_fee: firstNumber(row?.delivery_fee),
    delivery_distance_km: firstNumber(row?.delivery_distance_km),
    delivery_rate_per_km: firstNumber(row?.delivery_rate_per_km),
    collection_fee: firstNumber(row?.collection_fee),
    collection_distance_km: firstNumber(row?.collection_distance_km),
    collection_rate_per_km: firstNumber(row?.collection_rate_per_km),
    waiter_service_required: row?.waiter_service_required === true,
    waiter_count: firstNumber(row?.waiter_count),
    waiter_duration_hours: firstNumber(row?.waiter_duration_hours),
    waiter_hourly_rate: firstNumber(row?.waiter_hourly_rate),
    waiter_total_fee: firstNumber(row?.waiter_total_fee),
    discount_amount: firstNumber(row?.discount_amount),
    tax_amount: firstNumber(row?.tax_amount),
    total: firstNumber(row?.total, row?.total_amount) ?? 0,
    valid_until: row?.valid_until ?? null,
    terms_and_conditions: row?.terms_and_conditions ?? null,
    notes: row?.notes ?? null,
    status: row?.status ?? null,
    accepted_at: row?.accepted_at ?? null,
    company: row?.company || {},
  };
}
