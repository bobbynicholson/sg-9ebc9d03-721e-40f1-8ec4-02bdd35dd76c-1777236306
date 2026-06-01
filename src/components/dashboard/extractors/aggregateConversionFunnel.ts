/**
 * Tier 2 chart 3 - Conversion funnel.
 *
 * 5 stages:
 *   1. Leads created
 *   2. Quotes sent (linked to those leads OR created from any source)
 *   3. Quotes viewed (quotes.status reached "viewed")
 *   4. Quotes accepted
 *   5. Orders completed
 *
 * Date-range bound: leads / quotes counted by created_at within the
 * window; orders counted by event_date within the window.
 *
 * Each stage carries count + total rand value + drop-off % vs the
 * stage above. The chart renders horizontal bars proportional to
 * count.
 *
 * Pure function: input rows, output the 5 stages.
 */
import type { LeadForYoY, QuoteForYoY } from "./aggregateYoYStrip";
import type { RevenueByMonthInput } from "./aggregateRevenueByMonth";

export interface ConversionStage {
  key: "leads" | "quotes_sent" | "quotes_viewed" | "quotes_accepted" | "orders_completed";
  label: string;
  count: number;
  /** Total rand value at this stage. Leads have 0 (no value yet);
   *  quotes use total_amount; orders use total_amount. */
  value: number;
  /** Drop-off % vs the PREVIOUS stage. null for the first stage and
   *  whenever the previous stage was 0 (no base). */
  dropOffPct: number | null;
  /** Conversion % vs the FIRST stage. null when leads = 0. */
  vsLeadsPct: number | null;
}

export interface ConversionFunnelResult {
  stages: ConversionStage[];
  /** Convenience top-line number for the empty-state guard. */
  totalLeads: number;
  /**
   * Wave 70.50b - "won then churned" - quotes that were accepted in
   * the window AND whose child order was subsequently cancelled. NOT
   * a 6th funnel stage (would break the drop-off math); rendered as
   * a SIDEBAR stat alongside the main funnel.
   *
   * count = how many accepted-quote events fell over
   * value = rand value of the cancelled quotes
   * pctOfAccepted = churn rate vs accepted (null when accepted=0)
   *
   * Why this matters: previously a cancelled-after-acceptance looked
   * identical to "never accepted" in the funnel. Sales scorecards
   * couldn't see churn. The "won the pitch, lost the gig" pattern was
   * invisible. Salespeople could claim 100% conversion while operators
   * watched 30% of those wins cancel.
   */
  churned: {
    count: number;
    value: number;
    pctOfAccepted: number | null;
  };
}

const inWindow = (s: string | null | undefined, start: Date, end: Date): boolean => {
  if (!s) return false;
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return false;
  return dt >= start && dt <= end;
};

const inDateWindow = (s: string | null | undefined, start: Date, end: Date): boolean => {
  if (!s) return false;
  // event_date is YYYY-MM-DD. Local-day comparison is fine.
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return false;
  return dt >= start && dt <= end;
};

const dropOffPct = (current: number, prev: number | null): number | null => {
  if (prev === null || prev === 0) return null;
  return ((prev - current) / prev) * 100;
};

const ratioPct = (current: number, base: number | null): number | null => {
  if (base === null || base === 0) return null;
  return (current / base) * 100;
};

export function aggregateConversionFunnel(
  leads: LeadForYoY[],
  quotes: QuoteForYoY[],
  orders: RevenueByMonthInput[],
  rangeStart: Date,
  rangeEnd: Date,
): ConversionFunnelResult {
  // Stage 1: leads created in the window
  let leadsCount = 0;
  for (const l of leads) {
    if (inWindow(l.created_at, rangeStart, rangeEnd)) leadsCount += 1;
  }

  // Stage 2-4: quotes by status
  // Status timeline: draft -> sent -> viewed -> revised -> accepted/rejected/expired.
  // We bucket by FURTHEST stage reached. A quote currently "accepted"
  // also counted as having been sent + viewed historically.
  let quotesSent = 0, quotesViewed = 0, quotesAccepted = 0;
  let valueSent = 0, valueViewed = 0, valueAccepted = 0;
  for (const q of quotes) {
    // Use sent_at when set; otherwise created_at as fallback. Created
    // captures drafts which we don't count as "sent" - so we require
    // status to have moved past "draft".
    const movedPastDraft = !!q.status && q.status !== "draft" && q.status !== "pending";
    if (!movedPastDraft) continue;
    const anchor = q.accepted_at || q.created_at;
    if (!inWindow(anchor, rangeStart, rangeEnd)) continue;
    const v = Number(q.total_amount || 0);
    quotesSent += 1;
    valueSent += v;
    // TIGHTEN I.61: converted_to_order_id is the hard signal that the
    // deal reached the bottom of the funnel. Used here to make
    // viewed + accepted counts robust to quotes whose status field got
    // desynced to 'sent' by the I.61 root-cause bug.
    const isConverted = !!(q as any).converted_to_order_id;
    // TIGHTEN I.62 (2026-06-01): removed dead 'viewed' and 'revised'
    // string-matches. The current quote_status enum is (draft, sent,
    // accepted, rejected, expired) - 'viewed' and 'revised' were
    // dropped in migration 20260506140000. Old logic was checking
    // status strings that can never match. The viewed-stage count is
    // now "anything that moved past sent to a terminal outcome OR
    // got converted" which is the actual definition the funnel
    // wants.
    if (q.status === "accepted" || q.status === "rejected" || q.status === "expired" || isConverted) {
      quotesViewed += 1;
      valueViewed += v;
    }
    if (q.status === "accepted" || isConverted) {
      quotesAccepted += 1;
      valueAccepted += v;
    }
  }

  // Stage 5: orders completed in the window (event_date in range AND
  // status='completed'). delivered also counts as a successful outcome.
  let ordersCompleted = 0;
  let valueCompleted = 0;
  // Wave 70.50b - churned bucket: orders in the window whose status
  // ended up 'cancelled'. We anchor on event_date so the churn shows
  // up in the same period the event WOULD have happened, which is
  // the natural sales-scorecard window. value uses total_amount as
  // a proxy for "lost gross" - the rand we won then lost.
  let ordersChurned = 0;
  let valueChurned = 0;
  for (const o of orders) {
    if (!o.event_date) continue;
    if (!inDateWindow(o.event_date, rangeStart, rangeEnd)) continue;
    if (o.status === "completed" || o.status === "delivered") {
      ordersCompleted += 1;
      valueCompleted += Number(o.total_amount || 0);
    } else if (o.status === "cancelled") {
      ordersChurned += 1;
      valueChurned += Number(o.total_amount || 0);
    }
  }

  const stages: ConversionStage[] = [
    { key: "leads",            label: "Leads",            count: leadsCount,      value: 0,             dropOffPct: null,                                  vsLeadsPct: 100 },
    { key: "quotes_sent",      label: "Quotes sent",      count: quotesSent,      value: valueSent,     dropOffPct: dropOffPct(quotesSent, leadsCount),    vsLeadsPct: ratioPct(quotesSent, leadsCount) },
    { key: "quotes_viewed",    label: "Quotes viewed",    count: quotesViewed,    value: valueViewed,   dropOffPct: dropOffPct(quotesViewed, quotesSent),  vsLeadsPct: ratioPct(quotesViewed, leadsCount) },
    { key: "quotes_accepted",  label: "Quotes accepted",  count: quotesAccepted,  value: valueAccepted, dropOffPct: dropOffPct(quotesAccepted, quotesViewed), vsLeadsPct: ratioPct(quotesAccepted, leadsCount) },
    { key: "orders_completed", label: "Orders completed", count: ordersCompleted, value: valueCompleted, dropOffPct: dropOffPct(ordersCompleted, quotesAccepted), vsLeadsPct: ratioPct(ordersCompleted, leadsCount) },
  ];

  return {
    stages,
    totalLeads: leadsCount,
    churned: {
      count: ordersChurned,
      value: valueChurned,
      pctOfAccepted: ratioPct(ordersChurned, quotesAccepted),
    },
  };
}
