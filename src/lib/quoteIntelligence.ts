/**
 * Quote dashboard intelligence helpers.
 *
 * The /admin/quotes page lifts the same pattern the Clients CRM uses:
 *   - Derived status (action_needed / in_play / won / lost / expired)
 *   - Suggested next action (urgent / warm / neutral) with reason copy
 *   - Last-touch days
 *   - Auto-follow-up status from outgoing_email_queue
 *
 * Why a separate module: the logic is sizeable and we re-use it from
 * both the list view and the (forthcoming) detail/sheet view, so it
 * lives outside the page file.
 */
import type { Quote } from "@/types";

// Buckets we surface as filter pills at the top of the page. They
// collapse the raw quote_status enum into actionable groupings the
// catering team thinks in.
export type QuoteBucket =
  | "all"
  | "action_needed"   // draft (manual + client request), expiring within 3d
  | "in_play"         // sent / viewed, waiting on the client
  | "stale"           // sent > 7d ago, no reply
  | "won"             // accepted (with or without converted order)
  | "lost"            // rejected
  | "expired";        // expired

export interface QuoteIntelligence {
  bucket: Exclude<QuoteBucket, "all">;
  /** Tone of the suggested action - urgent first sort key. */
  tone: "urgent" | "warm" | "neutral";
  /** Short label rendered as the row's suggested-action text. */
  label: string;
  /** Long-form reason, rendered as the muted secondary line. */
  reason: string;
  /** Days since the most recent meaningful touch. Null if unknown. */
  daysSinceTouch: number | null;
  /** ISO timestamp of last touch (sent / viewed / created). */
  lastTouchAt: string | null;
  /** Whether this quote came from a client-portal submission. */
  isClientRequest: boolean;
  /** Days until valid_until if set and future, else null. */
  daysUntilExpiry: number | null;
  /** Days since the quote was created. */
  ageDays: number;
}

export interface QuoteAutoEmailSummary {
  /** Number of automated emails queued (not yet sent) for this quote. */
  queued: number;
  /** Number of automated emails sent for this quote. */
  sent: number;
  /** Most recent automation event we know about. */
  latest: { status: string; subject: string | null; at: string | null } | null;
}

export interface QuoteRowState {
  quote: Quote;
  intelligence: QuoteIntelligence;
  autoEmail: QuoteAutoEmailSummary;
  /** Stable sort key derived from tone + age so urgent + old items rise. */
  sortKey: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const DAY_MS = 1000 * 60 * 60 * 24;

function daysBetween(from: Date | string | null | undefined, to = new Date()): number | null {
  if (!from) return null;
  const d = typeof from === "string" ? new Date(from) : from;
  if (isNaN(d.getTime())) return null;
  return Math.floor((to.getTime() - d.getTime()) / DAY_MS);
}

function daysUntil(target: Date | string | null | undefined, from = new Date()): number | null {
  if (!target) return null;
  const d = typeof target === "string" ? new Date(target) : target;
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - from.getTime()) / DAY_MS);
}

// ── Derivation ──────────────────────────────────────────────────────────

/**
 * Derive intelligence for a single quote.
 *
 * The order of cases is deliberate - "draft from client request" is
 * checked before plain draft so the team sees that the client is
 * actively waiting. "Expiring" trumps "in play" so urgency surfaces.
 */
export function deriveQuoteIntelligence(q: any): QuoteIntelligence {
  const isClientRequest = q.external_source === "client_portal_rebook";
  const status = (q.status || "draft") as string;
  const created = q.created_at as string | null;
  const sent = q.sent_at as string | null;
  const viewed = q.viewed_at as string | null;
  const accepted = q.accepted_at as string | null;
  const validUntil = q.valid_until as string | null;
  const convertedOrderId = q.converted_to_order_id as string | null;

  const ageDays = daysBetween(created) ?? 0;
  const daysSinceSent = daysBetween(sent);
  const daysSinceViewed = daysBetween(viewed);
  const daysUntilExpiry = daysUntil(validUntil);

  // Most meaningful timestamp - viewed > sent > created.
  const lastTouchAt = viewed || sent || created;
  const daysSinceTouch = daysBetween(lastTouchAt);

  // ── EXPIRED ─────────────────────────────────────────────────────────
  if (status === "expired" || (validUntil && (daysUntilExpiry ?? 0) < 0 && status !== "accepted" && status !== "rejected")) {
    return {
      bucket: "expired",
      tone: "warm",
      label: "Re-quote",
      reason: validUntil
        ? `Expired ${Math.abs(daysUntilExpiry ?? 0)}d ago`
        : "Quote went past validity",
      daysSinceTouch,
      lastTouchAt,
      isClientRequest,
      daysUntilExpiry,
      ageDays,
    };
  }

  // ── REJECTED ────────────────────────────────────────────────────────
  if (status === "rejected") {
    return {
      bucket: "lost",
      tone: "neutral",
      label: "Win-back nudge",
      reason: "Quote was rejected, door's still open",
      daysSinceTouch,
      lastTouchAt,
      isClientRequest,
      daysUntilExpiry,
      ageDays,
    };
  }

  // ── ACCEPTED ────────────────────────────────────────────────────────
  if (status === "accepted") {
    if (!convertedOrderId) {
      return {
        bucket: "won",
        tone: "urgent",
        label: "Convert to order",
        reason: accepted
          ? `Accepted ${daysBetween(accepted) ?? 0}d ago, no order yet`
          : "Accepted, no order yet",
        daysSinceTouch: daysBetween(accepted) ?? daysSinceTouch,
        lastTouchAt: accepted || lastTouchAt,
        isClientRequest,
        daysUntilExpiry,
        ageDays,
      };
    }
    return {
      bucket: "won",
      tone: "neutral",
      label: "Won + booked",
      reason: "Accepted and converted to an order",
      daysSinceTouch: daysBetween(accepted) ?? daysSinceTouch,
      lastTouchAt: accepted || lastTouchAt,
      isClientRequest,
      daysUntilExpiry,
      ageDays,
    };
  }

  // ── DRAFT (action needed) ──────────────────────────────────────────
  if (status === "draft") {
    if (isClientRequest) {
      return {
        bucket: "action_needed",
        tone: "urgent",
        label: ageDays >= 1 ? `Price + send, client waiting ${ageDays}d` : "Price + send, client waiting",
        reason: "Submitted from client portal, they're expecting a quote",
        daysSinceTouch,
        lastTouchAt,
        isClientRequest,
        daysUntilExpiry,
        ageDays,
      };
    }
    return {
      bucket: "action_needed",
      tone: ageDays >= 3 ? "urgent" : "warm",
      label: ageDays >= 3 ? `Finish + send (${ageDays}d old)` : "Finish + send",
      reason: "Draft quote, not sent yet",
      daysSinceTouch,
      lastTouchAt,
      isClientRequest,
      daysUntilExpiry,
      ageDays,
    };
  }

  // ── EXPIRING SOON (sent / viewed but valid_until is close) ─────────
  if ((status === "sent" || status === "viewed" || status === "revised") && daysUntilExpiry !== null) {
    if (daysUntilExpiry <= 3) {
      return {
        bucket: "action_needed",
        tone: "urgent",
        label: `Confirm, expires in ${daysUntilExpiry}d`,
        reason: "Quote validity is running out",
        daysSinceTouch,
        lastTouchAt,
        isClientRequest,
        daysUntilExpiry,
        ageDays,
      };
    }
  }

  // ── VIEWED but no reply ────────────────────────────────────────────
  if (status === "viewed" || (status === "sent" && viewed)) {
    const sinceView = daysSinceViewed ?? 0;
    if (sinceView >= 2) {
      return {
        bucket: "action_needed",
        tone: "urgent",
        label: `Nudge, viewed ${sinceView}d ago, quiet`,
        reason: "They opened it but haven't replied",
        daysSinceTouch,
        lastTouchAt,
        isClientRequest,
        daysUntilExpiry,
        ageDays,
      };
    }
    return {
      bucket: "in_play",
      tone: "warm",
      label: "Viewed, let it breathe",
      reason: `They opened it ${sinceView}d ago`,
      daysSinceTouch,
      lastTouchAt,
      isClientRequest,
      daysUntilExpiry,
      ageDays,
    };
  }

  // ── SENT but not viewed ────────────────────────────────────────────
  if (status === "sent" || status === "revised") {
    const sinceSent = daysSinceSent ?? 0;
    if (sinceSent >= 7) {
      return {
        bucket: "stale",
        tone: "urgent",
        label: `Resend, ${sinceSent}d, no open`,
        reason: "They likely never saw the email",
        daysSinceTouch,
        lastTouchAt,
        isClientRequest,
        daysUntilExpiry,
        ageDays,
      };
    }
    if (sinceSent >= 3) {
      return {
        bucket: "in_play",
        tone: "warm",
        label: `Nudge, ${sinceSent}d, no open`,
        reason: "Quote has been out a few days",
        daysSinceTouch,
        lastTouchAt,
        isClientRequest,
        daysUntilExpiry,
        ageDays,
      };
    }
    return {
      bucket: "in_play",
      tone: "neutral",
      label: "Just sent, give it a beat",
      reason: sent ? `Sent ${sinceSent}d ago` : "Recently sent",
      daysSinceTouch,
      lastTouchAt,
      isClientRequest,
      daysUntilExpiry,
      ageDays,
    };
  }

  // ── PENDING (custom enum value) ────────────────────────────────────
  if (status === "pending") {
    return {
      bucket: "in_play",
      tone: "warm",
      label: "Awaiting client decision",
      reason: "Marked pending",
      daysSinceTouch,
      lastTouchAt,
      isClientRequest,
      daysUntilExpiry,
      ageDays,
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────
  return {
    bucket: "in_play",
    tone: "neutral",
    label: "Review",
    reason: `Status: ${status}`,
    daysSinceTouch,
    lastTouchAt,
    isClientRequest,
    daysUntilExpiry,
    ageDays,
  };
}

// ── Auto-email summary ─────────────────────────────────────────────────

interface AutoEmailRow {
  trigger_ref_id: string | null;
  status: string | null;
  subject: string | null;
  sent_at: string | null;
  created_at: string | null;
}

/**
 * Roll up outgoing_email_queue rows into per-quote summaries. The
 * caller passes the queue rows pre-filtered by trigger_ref_id IN
 * quote_ids so we only loop them once.
 */
export function summariseAutoEmailsByQuote(
  rows: AutoEmailRow[],
): Map<string, QuoteAutoEmailSummary> {
  const out = new Map<string, QuoteAutoEmailSummary>();
  for (const r of rows) {
    if (!r.trigger_ref_id) continue;
    const cur =
      out.get(r.trigger_ref_id) ||
      ({ queued: 0, sent: 0, latest: null } as QuoteAutoEmailSummary);
    const isSent = r.status === "sent" || !!r.sent_at;
    if (isSent) cur.sent += 1;
    else cur.queued += 1;
    const at = r.sent_at || r.created_at;
    if (!cur.latest || (at && cur.latest.at && new Date(at) > new Date(cur.latest.at)) || (at && !cur.latest.at)) {
      cur.latest = { status: isSent ? "sent" : "queued", subject: r.subject, at };
    }
    out.set(r.trigger_ref_id, cur);
  }
  return out;
}

// ── Sort key ───────────────────────────────────────────────────────────

const TONE_RANK: Record<QuoteIntelligence["tone"], number> = {
  urgent: 0,
  warm: 1,
  neutral: 2,
};

/**
 * Combined sort: urgent before warm before neutral. Within a tone,
 * older quotes (higher ageDays) bubble up so nothing rots.
 */
export function quoteSortKey(intel: QuoteIntelligence): number {
  return TONE_RANK[intel.tone] * 10000 - intel.ageDays;
}

// ── Bucket counts ──────────────────────────────────────────────────────

export interface BucketCounts {
  all: number;
  action_needed: number;
  in_play: number;
  stale: number;
  won: number;
  lost: number;
  expired: number;
}

export function countByBucket(rows: QuoteRowState[]): BucketCounts {
  const c: BucketCounts = {
    all: rows.length,
    action_needed: 0,
    in_play: 0,
    stale: 0,
    won: 0,
    lost: 0,
    expired: 0,
  };
  for (const r of rows) {
    c[r.intelligence.bucket] += 1;
  }
  return c;
}
