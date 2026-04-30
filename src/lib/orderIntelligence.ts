/**
 * Order dashboard intelligence helpers.
 *
 * Mirrors the lib/quoteIntelligence pattern:
 *   - Derived bucket (action_needed / today / upcoming / live / done / overdue)
 *   - Suggested next action with tone (urgent / warm / neutral) + reason
 *   - Live event countdown
 *   - Auto-email summary keyed off email_automation_log.order_id
 *
 * Bobby's framing: a healthy operations team should be able to glance
 * at the orders board and see exactly what's at risk -- driver not
 * assigned 24h before the event, post-event review automation pending,
 * unpaid balance with the date imminent. The "Suggested action" chip
 * is the single field that captures all of that on each row.
 */

export type OrderBucket =
  | "all"
  | "action_needed"   // missing assignments / unpaid balance / today imminent
  | "today"           // event_date is today
  | "upcoming"        // future event in good shape
  | "live"            // in_transit / delivered (today + delivering)
  | "done"            // completed
  | "overdue";        // past event_date, status not in {completed, cancelled}

export interface OrderIntelligence {
  bucket: Exclude<OrderBucket, "all">;
  tone: "urgent" | "warm" | "neutral";
  label: string;
  reason: string;
  /** Days until the event. Negative = past. Null if no event_date. */
  daysToEvent: number | null;
  /** True when event_date is today. */
  isToday: boolean;
  /** True when event_date is in the past and status isn't terminal. */
  isOverdue: boolean;
}

export interface OrderAutoEmailSummary {
  /** Total automated emails sent for this order. */
  sent: number;
  /** Most recent automation -- template_type + sent_at. */
  latest:
    | { template_type: string | null; status: string | null; sent_at: string | null }
    | null;
  /** True if a post-event review automation has fired. */
  postEventSent: boolean;
}

export interface OrderRowState<T = any> {
  order: T;
  intelligence: OrderIntelligence;
  autoEmail: OrderAutoEmailSummary;
  sortKey: number;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function daysUntilDate(target: any): number | null {
  if (!target) return null;
  const d = typeof target === "string" || typeof target === "number" ? new Date(target) : target;
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(d);
  eventDay.setHours(0, 0, 0, 0);
  return Math.round((eventDay.getTime() - today.getTime()) / DAY_MS);
}

/**
 * Derive intelligence for a single order row.
 *
 * Order of cases is deliberate -- terminal first (completed,
 * cancelled), then operational (overdue, today, soon), then default.
 * That way "completed but missing review email" doesn't drown out
 * "event tomorrow with no driver assigned".
 */
export function deriveOrderIntelligence(o: any): OrderIntelligence {
  const status = (o?.status || "pending") as string;
  const paymentStatus = (o?.payment_status || "pending") as string;
  const daysToEvent = daysUntilDate(o?.event_date);
  const isToday = daysToEvent === 0;
  const isOverdue =
    daysToEvent !== null &&
    daysToEvent < 0 &&
    status !== "completed" &&
    status !== "cancelled";

  const driverAssigned =
    !!o?.assigned_driver_id || !!o?.driver_id;
  const chefAssigned = !!o?.assigned_chef_id;

  // ── CANCELLED ─────────────────────────────────────────────────────
  if (status === "cancelled") {
    return {
      bucket: "done",
      tone: "neutral",
      label: "Cancelled",
      reason: "Order is closed",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  // ── COMPLETED ────────────────────────────────────────────────────
  if (status === "completed") {
    return {
      bucket: "done",
      tone: "neutral",
      label: "Done",
      reason: "Event completed",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  // ── OVERDUE (past event, not closed) ─────────────────────────────
  if (isOverdue) {
    return {
      bucket: "overdue",
      tone: "urgent",
      label: `Close out -- ${Math.abs(daysToEvent ?? 0)}d past event`,
      reason: "Mark completed or update status",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  // ── LIVE (in transit / delivered today) ──────────────────────────
  if (status === "in_transit") {
    return {
      bucket: "live",
      tone: "warm",
      label: "On the road",
      reason: "Driver is delivering",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }
  if (status === "delivered") {
    return {
      bucket: "live",
      tone: "warm",
      label: "Delivered -- close out",
      reason: "Mark completed once event is over",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  // ── TODAY ────────────────────────────────────────────────────────
  if (isToday) {
    if (!driverAssigned) {
      return {
        bucket: "action_needed",
        tone: "urgent",
        label: "Assign driver -- TODAY",
        reason: "Event is today and no driver is assigned",
        daysToEvent,
        isToday,
        isOverdue,
      };
    }
    if (status === "preparing" || status === "ready") {
      return {
        bucket: "today",
        tone: "warm",
        label: "Final pre-event check",
        reason: "Confirm equipment, route, contact",
        daysToEvent,
        isToday,
        isOverdue,
      };
    }
    return {
      bucket: "today",
      tone: "warm",
      label: "Event today",
      reason: "Stay close to it",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  // ── IMMINENT (1-3 days out) ──────────────────────────────────────
  if (daysToEvent !== null && daysToEvent <= 3 && daysToEvent > 0) {
    if (!driverAssigned) {
      return {
        bucket: "action_needed",
        tone: "urgent",
        label: `Assign driver -- ${daysToEvent}d to event`,
        reason: "No driver assigned and event is imminent",
        daysToEvent,
        isToday,
        isOverdue,
      };
    }
    if (paymentStatus !== "paid") {
      return {
        bucket: "action_needed",
        tone: "urgent",
        label: `Chase payment -- ${daysToEvent}d to event`,
        reason: "Balance not settled and event is imminent",
        daysToEvent,
        isToday,
        isOverdue,
      };
    }
    return {
      bucket: "today",
      tone: "warm",
      label: `Final pre-event check -- ${daysToEvent}d`,
      reason: "Confirm equipment, route, contact",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  // ── UPCOMING (future) ────────────────────────────────────────────
  if (daysToEvent !== null && daysToEvent > 3) {
    if (!driverAssigned && daysToEvent <= 7) {
      return {
        bucket: "action_needed",
        tone: "warm",
        label: `Assign driver (event in ${daysToEvent}d)`,
        reason: "Lock the driver in early",
        daysToEvent,
        isToday,
        isOverdue,
      };
    }
    if (paymentStatus === "pending" && daysToEvent <= 14) {
      return {
        bucket: "action_needed",
        tone: "warm",
        label: `Send invoice / chase deposit (${daysToEvent}d)`,
        reason: "Balance still pending",
        daysToEvent,
        isToday,
        isOverdue,
      };
    }
    return {
      bucket: "upcoming",
      tone: "neutral",
      label: `Event in ${daysToEvent}d`,
      reason: "On track",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  // ── PENDING / DRAFT (no date or weird state) ─────────────────────
  if (status === "pending" || status === "draft") {
    return {
      bucket: "action_needed",
      tone: "urgent",
      label: "Confirm + schedule",
      reason: "Order needs to move into the calendar",
      daysToEvent,
      isToday,
      isOverdue,
    };
  }

  return {
    bucket: "upcoming",
    tone: "neutral",
    label: "Review",
    reason: `Status: ${status}`,
    daysToEvent,
    isToday,
    isOverdue,
  };
}

interface AutoEmailLogRow {
  order_id: string | null;
  template_type: string | null;
  status: string | null;
  sent_at: string | null;
}

/**
 * Roll up email_automation_log rows into per-order summaries.
 * `postEventSent` flips on for any template_type that contains
 * 'review' or 'post' (covers post_event_review, post_event_thanks,
 * etc. without needing an exhaustive enum match).
 */
export function summariseAutoEmailsByOrder(
  rows: AutoEmailLogRow[],
): Map<string, OrderAutoEmailSummary> {
  const out = new Map<string, OrderAutoEmailSummary>();
  for (const r of rows) {
    if (!r.order_id) continue;
    const cur =
      out.get(r.order_id) ||
      ({ sent: 0, latest: null, postEventSent: false } as OrderAutoEmailSummary);
    cur.sent += 1;
    if (
      !cur.latest ||
      (r.sent_at && cur.latest.sent_at && new Date(r.sent_at) > new Date(cur.latest.sent_at)) ||
      (r.sent_at && !cur.latest.sent_at)
    ) {
      cur.latest = {
        template_type: r.template_type,
        status: r.status,
        sent_at: r.sent_at,
      };
    }
    const t = (r.template_type || "").toLowerCase();
    if (t.includes("review") || t.includes("post")) cur.postEventSent = true;
    out.set(r.order_id, cur);
  }
  return out;
}

const TONE_RANK: Record<OrderIntelligence["tone"], number> = {
  urgent: 0,
  warm: 1,
  neutral: 2,
};

export function orderSortKey(intel: OrderIntelligence): number {
  // Urgent first, then by event proximity (sooner = higher).
  const proximity =
    intel.daysToEvent === null ? 9999 : intel.daysToEvent < 0 ? 9000 + Math.abs(intel.daysToEvent) : intel.daysToEvent;
  return TONE_RANK[intel.tone] * 100000 + proximity;
}

export interface OrderBucketCounts {
  all: number;
  action_needed: number;
  today: number;
  upcoming: number;
  live: number;
  done: number;
  overdue: number;
}

export function countOrderBuckets(rows: OrderRowState[]): OrderBucketCounts {
  const c: OrderBucketCounts = {
    all: rows.length,
    action_needed: 0,
    today: 0,
    upcoming: 0,
    live: 0,
    done: 0,
    overdue: 0,
  };
  for (const r of rows) c[r.intelligence.bucket] += 1;
  return c;
}
