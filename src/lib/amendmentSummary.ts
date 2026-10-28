/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Plain-language summary of an order amendment request: what the client
 * asked to change, compared with the order as it was before approval
 * (order_amendment_requests.applied_snapshot.before).
 *
 * Quantities follow rebuildOrderItemsFromMenu: a per-person line with a
 * stored quantity of 0 means "one per guest", and a flat line is 1.
 */

export interface AmendmentLine {
  name: string;
  /** Display quantity, e.g. "28 (one per guest)" or "1". */
  quantity: string;
  /** Resolved count used for comparing before/after (null if unknown). */
  count: number | null;
  unitPrice: number | null;
}

export interface AmendmentLineChange {
  kind: "added" | "removed" | "changed";
  name: string;
  before?: AmendmentLine;
  after?: AmendmentLine;
}

export interface AmendmentSummary {
  guests: { before: number | null; after: number } | null;
  menu: AmendmentLineChange[];
  equipment: AmendmentLineChange[];
  /** Requested values with no "before" to compare against (pending requests). */
  requestedMenu: AmendmentLine[];
  requestedEquipment: AmendmentLine[];
  /** Other requested fields (event time, venue, ...) as label -> value. */
  other: Array<{ label: string; before: string | null; after: string }>;
}

const num = (v: any): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const keyOf = (it: any) => String(it?.menu_item_id || it?.equipment_id || it?.item_name || it?.name || "").trim().toLowerCase();
const nameOf = (it: any) => String(it?.item_name || it?.name || "Item").trim();

function menuLine(it: any, guests: number | null): AmendmentLine {
  const mode = String(it?.pricing_mode || it?.pricingMode || "per_person");
  const stored = num(it?.quantity) ?? 0;
  let quantity: string;
  let count: number | null;
  if (mode === "flat") { quantity = "1"; count = 1; }
  else if (mode === "per_person" && stored <= 0) { quantity = guests ? `${guests} (per guest)` : "Per guest"; count = guests; }
  else { quantity = String(stored); count = stored; }
  return { name: nameOf(it), quantity, count, unitPrice: num(it?.unit_price ?? it?.unitPrice ?? it?.pricePerPerson ?? it?.price) };
}

function equipmentLine(it: any): AmendmentLine {
  const count = num(it?.quantity) ?? 0;
  return { name: nameOf(it), quantity: String(count), count, unitPrice: num(it?.unit_price ?? it?.rentalPrice) };
}

function diff(
  before: any[],
  after: any[],
  lineBefore: (it: any) => AmendmentLine,
  lineAfter: (it: any) => AmendmentLine = lineBefore,
): AmendmentLineChange[] {
  const out: AmendmentLineChange[] = [];
  const beforeByKey = new Map(before.map((it) => [keyOf(it), it]));
  const afterKeys = new Set(after.map(keyOf));
  for (const it of after) {
    const prev = beforeByKey.get(keyOf(it));
    const a = lineAfter(it);
    if (!prev) { out.push({ kind: "added", name: a.name, after: a }); continue; }
    const b = lineBefore(prev);
    if (b.count !== a.count || b.unitPrice !== a.unitPrice) out.push({ kind: "changed", name: a.name, before: b, after: a });
  }
  for (const it of before) {
    if (!afterKeys.has(keyOf(it))) { const b = lineBefore(it); out.push({ kind: "removed", name: b.name, before: b }); }
  }
  return out;
}

const OTHER_LABELS: Record<string, string> = {
  event_date: "Event date",
  event_time: "Event time",
  setup_time: "Setup time",
  venue_address: "Venue",
  dietary_requirements: "Dietary requirements",
  special_instructions: "Special instructions",
  delivery_notes: "Delivery notes",
};

const text = (v: any): string => (v === null || v === undefined || v === "" ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function summariseAmendment(proposed: any, before: any | null): AmendmentSummary {
  const p = proposed || {};
  const b = before || null;
  const guestsAfter = num(p.guest_count);
  const guestsBefore = b ? num(b.guest_count) : null;
  const guestsForLines = guestsAfter ?? guestsBefore;

  const summary: AmendmentSummary = {
    guests: guestsAfter !== null && guestsAfter !== guestsBefore ? { before: guestsBefore, after: guestsAfter } : null,
    menu: [],
    equipment: [],
    requestedMenu: [],
    requestedEquipment: [],
    other: [],
  };

  if (Array.isArray(p.menu_items)) {
    if (b && Array.isArray(b.menu_items)) {
      // Before-lines scale with the guest count the order had then.
      const beforeGuests = guestsBefore ?? guestsForLines;
      summary.menu = diff(b.menu_items, p.menu_items, (it) => menuLine(it, beforeGuests), (it) => menuLine(it, guestsForLines));
    } else {
      summary.requestedMenu = p.menu_items.map((it: any) => menuLine(it, guestsForLines));
    }
  }

  if (Array.isArray(p.equipment_items)) {
    if (b && Array.isArray(b.equipment_items)) summary.equipment = diff(b.equipment_items, p.equipment_items, equipmentLine);
    else summary.requestedEquipment = p.equipment_items.map(equipmentLine);
  }

  for (const [k, v] of Object.entries(p)) {
    if (["menu_items", "equipment_items", "guest_count"].includes(k)) continue;
    // Bookkeeping fields (updated_at, ids) are not changes anyone asked for.
    if (/(^id$|_id$|_at$)/.test(k)) continue;
    const beforeValue = b && k in b ? text(b[k]) : null;
    if (beforeValue !== null && beforeValue === text(v)) continue;
    summary.other.push({ label: OTHER_LABELS[k] || k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), before: beforeValue, after: text(v) });
  }

  return summary;
}

export function hasChanges(s: AmendmentSummary): boolean {
  return !!s.guests || s.menu.length > 0 || s.equipment.length > 0 || s.requestedMenu.length > 0 || s.requestedEquipment.length > 0 || s.other.length > 0;
}

/** Friendly names for audit_logs actions shown in an order's History. */
const ACTION_LABELS: Record<string, string> = {
  amendment_requested_magic: "Client requested a change (via their link)",
  amendment_requested: "Client requested a change",
  amendment_approved: "Change request approved",
  amendment_partial_approved: "Change request partly approved",
  amendment_rejected: "Change request declined",
  order_purged: "Order deleted",
};

export function historyActionLabel(action: string | null | undefined): string {
  if (!action) return "Changed something";
  return ACTION_LABELS[action] || action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function isAmendmentAction(action: string | null | undefined): boolean {
  return !!action && action.startsWith("amendment_");
}

/** One short, readable phrase per change, for a row-level summary. */
export interface SummaryPhrase {
  verb: string;
  subject: string;
  rest?: string;
}

export function summaryPhrases(s: AmendmentSummary): SummaryPhrase[] {
  const out: SummaryPhrase[] = [];
  if (s.guests) out.push({ verb: "Guests", subject: String(s.guests.after), rest: s.guests.before !== null ? `(was ${s.guests.before})` : undefined });
  for (const c of [...s.menu, ...s.equipment]) {
    if (c.kind === "added") out.push({ verb: "Added", subject: c.name, rest: c.after ? `(${c.after.quantity.replace(/ \(per guest\)$/, " per guest")})` : undefined });
    else if (c.kind === "removed") out.push({ verb: "Removed", subject: c.name });
    else if (c.before && c.after) {
      const qty = c.before.count !== c.after.count ? `${c.before.quantity} → ${c.after.quantity}` : null;
      out.push({ verb: "Changed", subject: c.name, rest: qty ? `(${qty})` : "(new price)" });
    }
  }
  for (const l of [...s.requestedMenu, ...s.requestedEquipment]) out.push({ verb: "Asked for", subject: l.name, rest: `(${l.quantity})` });
  for (const o of s.other) out.push({ verb: o.label, subject: o.after });
  return out;
}

/** A to-do line: lead text followed by the items it applies to (shown bold). */
export interface NextStep {
  lead: string;
  items: string[];
}

/**
 * What the team should do because of this request, in plain words.
 * `status` is the request status: pending requests need a decision first.
 */
export function amendmentNextSteps(s: AmendmentSummary, status: string | null | undefined): NextStep[] {
  const steps: NextStep[] = [];
  if (status === "pending") steps.push({ lead: "Review this request and approve or decline it, so the client knows where they stand.", items: [] });
  if (status === "rejected") {
    steps.push({ lead: "Nothing changed on the order. Make sure the client knows the request was declined.", items: [] });
    return steps;
  }
  const verb = status === "pending" ? "If approved, " : "";
  const menuItems = [...s.menu.map((c) => c.name), ...s.requestedMenu.map((l) => l.name)];
  if (menuItems.length) steps.push({ lead: `${verb}Kitchen and shopping: re-check prep and stock for`, items: menuItems });
  const equipment = [...s.equipment.map((c) => c.name), ...s.requestedEquipment.map((l) => l.name)];
  if (equipment.length) steps.push({ lead: `${verb}Equipment: re-check what gets packed and charged for`, items: equipment });
  if (s.guests) steps.push({ lead: `${verb}Staffing and portions: plan for`, items: [`${s.guests.after} guests`] });
  const schedule = s.other.filter((o) => /date|time|venue|address|delivery/i.test(o.label));
  if (schedule.length) steps.push({ lead: `${verb}Driver and schedule: confirm the new`, items: schedule.map((o) => `${o.label.toLowerCase()} (${o.after})`) });
  const priced = s.guests || s.menu.length || s.equipment.length || s.requestedMenu.length || s.requestedEquipment.length;
  if (priced && status !== "pending") steps.push({ lead: "Finance: the order total and invoice were updated. Check the amount and send the client the latest payment request if anything is still owed.", items: [] });
  return steps;
}
