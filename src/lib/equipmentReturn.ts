/**
 * Who brings an order's equipment back after the event.
 *
 * Chosen on the quote ("Equipment return"), copied to the order
 * (orders.equipment_return_method) and editable there. Everything that
 * depends on it reads resolveEquipmentReturn():
 *   - the collection trip is created only for driver_same_day /
 *     driver_next_day (orderWorkflow, on delivered)
 *   - the waiter's "Equipment returned" step shows only for waiter
 *   - order page, quote, driver and waiter screens show who is responsible
 *
 * Before this the system guessed: a waiter on the job meant "the waiter
 * brings it back" (no collection trip), otherwise a driver collection.
 * Orders saved before the choice existed keep that guess, so nothing in
 * flight changes behaviour.
 */

export type EquipmentReturnMethod = "driver_same_day" | "driver_next_day" | "waiter" | "none";

export const EQUIPMENT_RETURN_METHODS: EquipmentReturnMethod[] = [
  "driver_same_day",
  "driver_next_day",
  "waiter",
  "none",
];

/** Default for a new quote. */
export const DEFAULT_EQUIPMENT_RETURN: EquipmentReturnMethod = "driver_same_day";

export const EQUIPMENT_RETURN_OPTIONS: Record<EquipmentReturnMethod, {
  /** Short label for pickers. */
  label: string;
  /** Who is responsible, for "Equipment return: ..." lines. */
  responsible: string;
  /** One line explaining what happens. */
  detail: string;
  /** What the client reads on their quote. */
  client: string;
}> = {
  driver_same_day: {
    label: "Our driver collects - same day",
    responsible: "Driver (collection trip, same day)",
    detail: "A collection trip is booked for the end of the event (about 5 hours after it starts).",
    client: "We collect the equipment after your event, on the same day.",
  },
  driver_next_day: {
    label: "Our driver collects - next day",
    responsible: "Driver (collection trip, next morning)",
    detail: "A collection trip is booked for 09:00 the morning after the event.",
    client: "We collect the equipment the morning after your event (from 09:00).",
  },
  waiter: {
    label: "Waiter brings it back",
    responsible: "Waiter (brings it back after service)",
    detail: "No collection trip. The waiter on the job brings everything back and marks it returned.",
    client: "Our on-site waiter packs up and brings the equipment back after service.",
  },
  none: {
    label: "Client returns it / nothing to return",
    responsible: "No return by us (client returns it, or nothing to return)",
    detail: "No collection trip and no return step for our team.",
    client: "We don't collect equipment for this event. If you have hired equipment from us, please return it as agreed.",
  },
};

export interface EquipmentReturnSource {
  equipment_return_method?: string | null;
  collection_next_day?: boolean | null;
  requires_waiter?: boolean | null;
  waiter_service_required?: boolean | null;
}

/** The effective method: the explicit choice, else the legacy guess. */
export function resolveEquipmentReturn(src: EquipmentReturnSource | null | undefined): EquipmentReturnMethod {
  const raw = String(src?.equipment_return_method || "").trim().toLowerCase();
  if ((EQUIPMENT_RETURN_METHODS as string[]).includes(raw)) return raw as EquipmentReturnMethod;
  // Older values written by earlier builds.
  if (raw === "deliver_and_collect" || raw === "collect") {
    return src?.collection_next_day ? "driver_next_day" : "driver_same_day";
  }
  if (raw === "client_keeps" || raw === "client_returns") return "none";
  // No choice saved (orders from before the field): keep the old guess.
  if (src?.requires_waiter || src?.waiter_service_required) return "waiter";
  return src?.collection_next_day ? "driver_next_day" : "driver_same_day";
}

export function isDriverCollection(method: EquipmentReturnMethod): boolean {
  return method === "driver_same_day" || method === "driver_next_day";
}

/** "Equipment return: Driver (collection trip, next morning)". */
export function equipmentReturnLine(src: EquipmentReturnSource | null | undefined): string {
  return `Equipment return: ${EQUIPMENT_RETURN_OPTIONS[resolveEquipmentReturn(src)].responsible}`;
}

// ── Return status (order page + overdue reminders) ──────────────────────

export interface ReturnStatusInput {
  method: EquipmentReturnMethod;
  now: Date;
  /** Event start (local date + time); used when no better signal exists. */
  eventStart: Date | null;
  /** Hours the waiter service was booked for (quote), if known. */
  waiterHours?: number | null;
  /** Driver collection trip, if one exists. */
  collection?: {
    status: string | null;
    scheduled_for: string | null;
    picked_up_at?: string | null;
    completed_at?: string | null;
  } | null;
  /** Waiter attendance rows for the order. */
  attendance?: Array<{ event_complete_at: string | null; equipment_returned_at: string | null }>;
  /** Booked equipment: quantity out and how much came back. */
  bookings?: Array<{ quantity: number | null; returned_quantity: number | null; status: string | null }>;
}

export type ReturnState = "not_applicable" | "waiting" | "in_progress" | "returned" | "overdue";

export interface ReturnStatus {
  state: ReturnState;
  /** Short line for the order page. */
  text: string;
  /** When the return is due, if known. */
  dueAt: Date | null;
  booked: number;
  back: number;
  /** Units that were booked out and are not back (only once returned). */
  missing: number;
}

/** Grace after the due time before a return counts as overdue. */
export const RETURN_OVERDUE_GRACE_HOURS = 3;

const hoursAfter = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

export function computeReturnStatus(input: ReturnStatusInput): ReturnStatus {
  const live = (input.bookings || []).filter((b) => b.status !== "cancelled");
  const booked = live.reduce((s, b) => s + Math.max(0, Number(b.quantity || 0)), 0);
  const allReturned = live.length > 0 && live.every((b) => b.status === "returned");
  const back = live.reduce((s, b) => s + (b.status === "returned"
    ? Math.max(0, Number(b.returned_quantity ?? b.quantity ?? 0))
    : 0), 0);
  const base = { booked, back, missing: allReturned ? Math.max(0, booked - back) : 0 };

  if (input.method === "none" || booked === 0) {
    return { state: "not_applicable", text: booked === 0 ? "No equipment booked on this order." : "Not collected by us.", dueAt: null, ...base };
  }

  if (allReturned) {
    const when = input.collection?.completed_at
      || (input.attendance || []).map((a) => a.equipment_returned_at).filter(Boolean).sort()[0]
      || null;
    return {
      state: "returned",
      text: `Back at base${when ? ` ${new Date(when).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}: ${back} of ${booked} back${base.missing ? `, ${base.missing} missing` : ""}.`,
      dueAt: null,
      ...base,
    };
  }

  if (isDriverCollection(input.method)) {
    const c = input.collection;
    if (!c) {
      return { state: "waiting", text: "Collection trip is booked when the order is delivered.", dueAt: null, ...base };
    }
    const dueAt = c.scheduled_for ? new Date(c.scheduled_for) : null;
    if (c.status === "en_route" || c.status === "picked_up") {
      return { state: "in_progress", text: c.status === "picked_up" ? "Collected - driver on the way back to base." : "Driver is on the way to collect.", dueAt, ...base };
    }
    if (dueAt && input.now > hoursAfter(dueAt, RETURN_OVERDUE_GRACE_HOURS)) {
      return { state: "overdue", text: `Overdue - collection was due ${dueAt.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`, dueAt, ...base };
    }
    return { state: "waiting", text: dueAt ? `Collection booked for ${dueAt.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : "Collection trip booked.", dueAt, ...base };
  }

  // Waiter brings it back: due a few hours after the waiter closes the
  // event, or after the booked service window when nobody has yet.
  const completes = (input.attendance || []).map((a) => a.event_complete_at).filter(Boolean).sort() as string[];
  const eventEnd = completes.length
    ? new Date(completes[completes.length - 1])
    : input.eventStart
      ? hoursAfter(input.eventStart, Math.max(1, Number(input.waiterHours) || 6))
      : null;
  const dueAt = eventEnd ? hoursAfter(eventEnd, RETURN_OVERDUE_GRACE_HOURS) : null;
  if (dueAt && input.now > dueAt) {
    return { state: "overdue", text: "Overdue - the waiter has not marked the equipment returned.", dueAt, ...base };
  }
  return {
    state: completes.length ? "in_progress" : "waiting",
    text: completes.length ? "Event complete - waiting for the waiter to bring the equipment back." : "The waiter brings the equipment back after service.",
    dueAt,
    ...base,
  };
}

// ── Return count -> missing / damaged records ─────────────────────────

/** Whole number between 0 and max from a typed count. */
export const returnCountInt = (v: string, max: number): number => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

export interface ReturnCountLine {
  equipmentId: string;
  booked: number;
  unitCost: number;
  /** Counted back, as typed. */
  back: string;
  /** Damaged among those back, as typed. */
  damaged: string;
  damageType: "damaged" | "broken";
  note: string;
}

export interface ReturnCountRecord {
  equipmentId: string;
  quantityDamaged: number;
  damageType: "damaged" | "broken" | "lost";
  unitCost: number;
  description?: string;
}

/** Turn the return counts into missing (lost) and damaged records:
 *  anything not counted back is missing; damaged is entered separately. */
export function countsToDamages(lines: ReturnCountLine[]): ReturnCountRecord[] {
  const out: ReturnCountRecord[] = [];
  for (const l of lines) {
    const back = returnCountInt(l.back, l.booked);
    const missing = l.booked - back;
    const damaged = returnCountInt(l.damaged, back);
    const note = l.note.trim();
    if (missing > 0) {
      out.push({
        equipmentId: l.equipmentId,
        quantityDamaged: missing,
        damageType: "lost",
        unitCost: l.unitCost,
        description: note ? `Missing on return: ${note}` : "Missing on return (not counted back)",
      });
    }
    if (damaged > 0) {
      out.push({
        equipmentId: l.equipmentId,
        quantityDamaged: damaged,
        damageType: l.damageType,
        unitCost: l.unitCost,
        description: note || undefined,
      });
    }
  }
  return out;
}


// ── Shared notification audience + collection timing ───────────────────

/**
 * Who in the office hears about equipment-return events (collection
 * booked / reassigned / overdue, equipment back at base, missing items).
 * One list for every return notification so no path forgets the owner or
 * the branch (region) admin.
 */
export const EQUIPMENT_RETURN_ADMIN_ROLES = ["company_admin", "owner", "admin", "region_admin"] as const;

/**
 * When a collection trip is due (same rule the auto-scheduler always used):
 * next day -> 09:00 the morning after; same day -> event start + 5h;
 * same day without a start time -> 23:00 that night.
 */
export function collectionScheduledFor(eventDate: string | null | undefined, eventTime: string | null | undefined, method: EquipmentReturnMethod): Date {
  const d = eventDate ? new Date(`${eventDate}T00:00:00`) : new Date();
  if (method === "driver_next_day") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (eventTime) {
    const [h, m] = String(eventTime).split(":").map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return new Date(d.getTime() + 5 * 3_600_000);
  }
  d.setHours(23, 0, 0, 0);
  return d;
}
