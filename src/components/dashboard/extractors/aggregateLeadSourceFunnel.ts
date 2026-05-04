/**
 * Tier 4 chart 1 -- Lead source -> outcome funnel.
 *
 * Three columns:
 *   Left   = leads.source values (manual_add, embed, client_portal_rebook,
 *            ai_import, order_backfill, ...)
 *   Middle = "Quoted" / "Not quoted" (does the lead have any quote?)
 *   Right  = "Won" / "Lost" / "In flight" (final outcome)
 *
 * Renders as a 3-column flow visualisation (custom -- Recharts'
 * Sankey is unstable on small datasets and adds a heavy import for
 * one chart). Each "link" carries a count + share-of-source.
 *
 * Pure function: input leads (with source) + quotes (linked by lead_id),
 * return the nodes + edges.
 */
import type { LeadForYoY, QuoteForYoY } from "./aggregateYoYStrip";

export type FunnelMiddleStage = "quoted" | "not_quoted";
export type FunnelOutcome = "won" | "lost" | "in_flight";

export interface SourceNode {
  key: string;       // raw source value
  label: string;     // human-friendly label
  total: number;
}

export interface MiddleNode {
  key: FunnelMiddleStage;
  label: string;
  total: number;
}

export interface OutcomeNode {
  key: FunnelOutcome;
  label: string;
  total: number;
}

export interface FunnelLink {
  from: string;
  to: string;
  count: number;
}

export interface LeadSourceFunnelResult {
  sources: SourceNode[];
  middles: MiddleNode[];
  outcomes: OutcomeNode[];
  /** Edges from source -> middle stage */
  sourceToMiddle: FunnelLink[];
  /** Edges from middle stage -> outcome */
  middleToOutcome: FunnelLink[];
  totalLeads: number;
}

const SOURCE_LABELS: Record<string, string> = {
  manual_add: "Manual",
  embed: "Embed form",
  client_portal_rebook: "Portal rebook",
  ai_import: "AI import",
  order_backfill: "Order backfill",
  client_backfill: "Client backfill",
  quote_builder: "Quote builder",
};

const labelFor = (raw: string | null | undefined): string => {
  if (!raw) return "Unknown";
  return SOURCE_LABELS[raw] || raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const outcomeForLeadStatus = (status: string | null | undefined): FunnelOutcome => {
  switch (status) {
    case "won":
    case "converted":
      return "won";
    case "lost":
      return "lost";
    default:
      return "in_flight";
  }
};

export function aggregateLeadSourceFunnel(
  leads: LeadForYoY[],
  quotes: QuoteForYoY[],
): LeadSourceFunnelResult {
  // Index quotes by lead_id -- but our QuoteForYoY shape doesn't carry
  // lead_id directly. Workaround: any quote whose status reached past
  // "draft" is considered to have "been sent". For the source -> quoted
  // connection we use the lead's own status as a proxy: leads in
  // "quoted" / "won" / "converted" / "lost" all had a quote in flight.
  const QUOTED_LEAD_STATUSES = new Set(["quoted", "won", "converted", "lost"]);

  // Build per-source aggregation.
  type SourceAgg = {
    label: string;
    total: number;
    quoted: number;
    notQuoted: number;
    won: number;
    lost: number;
    inFlight: number;
  };
  const aggBySource = new Map<string, SourceAgg>();

  for (const l of leads) {
    const sourceKey = l.source || "unknown";
    if (!aggBySource.has(sourceKey)) {
      aggBySource.set(sourceKey, {
        label: labelFor(sourceKey),
        total: 0, quoted: 0, notQuoted: 0,
        won: 0, lost: 0, inFlight: 0,
      });
    }
    const agg = aggBySource.get(sourceKey)!;
    agg.total += 1;
    if (QUOTED_LEAD_STATUSES.has(l.status || "")) {
      agg.quoted += 1;
    } else {
      agg.notQuoted += 1;
    }
    const outcome = outcomeForLeadStatus(l.status);
    if (outcome === "won") agg.won += 1;
    else if (outcome === "lost") agg.lost += 1;
    else agg.inFlight += 1;
  }

  // Total leads (avoid double-count -- middles + outcomes both sum to
  // total per source).
  let totalLeads = 0;
  for (const a of aggBySource.values()) totalLeads += a.total;

  // Sort sources biggest first so the chart reads top-down.
  const sortedSources = Array.from(aggBySource.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  );

  const sources: SourceNode[] = sortedSources.map(([key, a]) => ({
    key, label: a.label, total: a.total,
  }));

  // Middle column totals.
  let totalQuoted = 0, totalNotQuoted = 0;
  for (const a of aggBySource.values()) {
    totalQuoted += a.quoted;
    totalNotQuoted += a.notQuoted;
  }
  const middles: MiddleNode[] = [
    { key: "quoted", label: "Quoted", total: totalQuoted },
    { key: "not_quoted", label: "Not quoted", total: totalNotQuoted },
  ];

  // Outcome column totals.
  let totalWon = 0, totalLost = 0, totalInFlight = 0;
  for (const a of aggBySource.values()) {
    totalWon += a.won;
    totalLost += a.lost;
    totalInFlight += a.inFlight;
  }
  const outcomes: OutcomeNode[] = [
    { key: "won", label: "Won", total: totalWon },
    { key: "lost", label: "Lost", total: totalLost },
    { key: "in_flight", label: "In flight", total: totalInFlight },
  ];

  // Edges: source -> middle
  const sourceToMiddle: FunnelLink[] = [];
  for (const [key, a] of sortedSources) {
    if (a.quoted > 0)    sourceToMiddle.push({ from: key, to: "quoted", count: a.quoted });
    if (a.notQuoted > 0) sourceToMiddle.push({ from: key, to: "not_quoted", count: a.notQuoted });
  }

  // Edges: middle -> outcome
  // "Not quoted" -> in_flight or lost (never won, by definition).
  // "Quoted" -> any outcome.
  let notQuotedInFlight = 0;
  let notQuotedLost = 0;
  let quotedWon = 0, quotedLost = 0, quotedInFlight = 0;
  for (const l of leads) {
    const isQuoted = QUOTED_LEAD_STATUSES.has(l.status || "");
    const outcome = outcomeForLeadStatus(l.status);
    if (isQuoted) {
      if (outcome === "won") quotedWon += 1;
      else if (outcome === "lost") quotedLost += 1;
      else quotedInFlight += 1;
    } else {
      if (outcome === "lost") notQuotedLost += 1;
      else notQuotedInFlight += 1;
    }
  }

  const middleToOutcome: FunnelLink[] = [];
  if (quotedWon > 0)         middleToOutcome.push({ from: "quoted", to: "won", count: quotedWon });
  if (quotedLost > 0)        middleToOutcome.push({ from: "quoted", to: "lost", count: quotedLost });
  if (quotedInFlight > 0)    middleToOutcome.push({ from: "quoted", to: "in_flight", count: quotedInFlight });
  if (notQuotedLost > 0)     middleToOutcome.push({ from: "not_quoted", to: "lost", count: notQuotedLost });
  if (notQuotedInFlight > 0) middleToOutcome.push({ from: "not_quoted", to: "in_flight", count: notQuotedInFlight });

  return { sources, middles, outcomes, sourceToMiddle, middleToOutcome, totalLeads };
}
