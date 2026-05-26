/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Quote follow-up service - traffic-light state per quote + record
 * the operator's manual sends to quote_followup_log.
 *
 * Design notes:
 *   - Sequence is fixed today: FU1 (chase), FU2 (sweetener), FU3
 *     (winback). Cadence comes from settings.automation:
 *     autoFollowUpDays + secondFollowUpDays + a third nudge at
 *     2x secondFollowUpDays.
 *   - Nothing fires automatically. computeFollowupState is a pure
 *     function over (quote, log rows, cadence) so the Quotes page
 *     can render the pill without round-tripping the server.
 *   - On send, recordFollowupSent inserts a row keyed on
 *     sequence_position. The pill flips green for that step.
 *
 * Traffic light:
 *   green     done / sent
 *   amber     ready or due (operator should click Send follow-up)
 *   rose      overdue (sent_at + cadence + 5 days passed without action)
 *   slate     not yet due / not applicable (draft, accepted, rejected)
 */
import { supabase } from "@/integrations/supabase/client";

export type FollowupChannel = "email" | "whatsapp";
export type FollowupStatus = "sent" | "skipped" | "failed";
export type FollowupTrafficLight = "green" | "amber" | "rose" | "slate";

export interface FollowupCadence {
  /** Days after sent_at to nudge with FU1 (no discount). */
  firstAfterDays: number;
  /** Days after sent_at to nudge with FU2 (sweetener / discount). */
  secondAfterDays: number;
  /** Days after sent_at to nudge with FU3 (winback). Defaults to
   *  2 x secondAfterDays. */
  thirdAfterDays: number;
}

export const DEFAULT_FOLLOWUP_CADENCE: FollowupCadence = {
  firstAfterDays: 5,
  secondAfterDays: 14,
  thirdAfterDays: 28,
};

export interface FollowupLogRow {
  id: string;
  quote_id: string;
  sequence_position: number;
  template_key: string;
  channel: FollowupChannel;
  status: FollowupStatus;
  sent_at: string;
}

export interface FollowupState {
  /** Traffic-light tone for the row pill. */
  light: FollowupTrafficLight;
  /** Short label for the pill: "FU 1 sent 3d ago", "Ready to send FU 1",
   *  "FU 2 due in 4d", "FU 3 overdue", "Sequence complete", "—". */
  label: string;
  /** Long-form reason for hover. */
  reason: string;
  /** The next FU position the operator should send (1, 2, 3) or null
   *  when nothing's due. Drives the Send-follow-up button. */
  nextPosition: number | null;
  /** Highest position already sent (0 when nothing). */
  lastSentPosition: number;
  /** Days since the most recent log entry, null when nothing's been sent. */
  daysSinceLastSent: number | null;
}

/** Map a position to a registry template key by channel. The wording
 *  itself lives in the message-templates registry; the operator can
 *  customise the body on /admin/messaging-templates. */
export function templateKeyFor(position: number, channel: FollowupChannel): string {
  if (channel === "email") {
    if (position === 1) return "email_lead_quoted";  // first chase
    if (position === 2) return "email_lead_quiet";   // sweetener
    return "email_lead_lost";                         // winback
  }
  // WhatsApp
  if (position === 1) return "quote_chase";
  if (position === 2) return "quote_chase";
  return "lead_followup";
}

/** Pure: derive the follow-up state from the quote's lifecycle data
 *  and the log rows for that quote. No DB round-trips. */
export function computeFollowupState(
  quote: { id: string; status?: string | null; sent_at?: string | null; accepted_at?: string | null },
  logRows: FollowupLogRow[],
  cadence: FollowupCadence = DEFAULT_FOLLOWUP_CADENCE,
  now: Date = new Date(),
): FollowupState {
  const status = String(quote.status || "").toLowerCase();
  // Sequence doesn't apply to terminal states.
  if (status === "accepted" || status === "rejected" || status === "expired") {
    return {
      light: "slate",
      // TIGHTEN I.11: was "—" (em dash, banned). Plain hyphen is
      // the canonical missing-value placeholder across the admin
      // pages. The /admin/quotes consumer keeps its `label !== "-"`
      // suppression so closed quotes still render without the
      // badge.
      label: "-",
      reason: `Quote is ${status}; no further follow-ups needed.`,
      nextPosition: null,
      lastSentPosition: 0,
      daysSinceLastSent: null,
    };
  }
  // Draft / not yet sent: there's nothing to follow up on.
  if (!quote.sent_at || status === "draft") {
    return {
      light: "slate",
      label: "Not sent yet",
      reason: "Send the quote first; the follow-up sequence starts ticking from sent_at.",
      nextPosition: null,
      lastSentPosition: 0,
      daysSinceLastSent: null,
    };
  }

  const sentAt = new Date(quote.sent_at);
  const daysSinceSent = Math.floor((now.getTime() - sentAt.getTime()) / 86_400_000);
  const sortedLog = [...logRows].sort((a, b) => a.sequence_position - b.sequence_position);
  const lastSent = sortedLog[sortedLog.length - 1];
  const lastSentPosition = lastSent?.sequence_position ?? 0;
  const daysSinceLastSent = lastSent
    ? Math.floor((now.getTime() - new Date(lastSent.sent_at).getTime()) / 86_400_000)
    : null;

  // All three follow-ups already done.
  if (lastSentPosition >= 3) {
    return {
      light: "green",
      label: "Sequence complete",
      reason: `Last nudge fired ${daysSinceLastSent}d ago. Three follow-ups is the cap - archive or chase by phone.`,
      nextPosition: null,
      lastSentPosition,
      daysSinceLastSent,
    };
  }

  const nextPosition = lastSentPosition + 1;
  const dueDay =
    nextPosition === 1 ? cadence.firstAfterDays
    : nextPosition === 2 ? cadence.secondAfterDays
    : cadence.thirdAfterDays;
  const dueIn = dueDay - daysSinceSent;

  // Just sent the previous step - show a green confirmation pill
  // for a beat (~24h grace) before flipping to amber.
  if (lastSent && daysSinceLastSent !== null && daysSinceLastSent < 1) {
    return {
      light: "green",
      label: `FU ${lastSentPosition} sent today`,
      reason: `Logged ${lastSent.channel} send; FU ${nextPosition} is due in ${dueIn}d.`,
      nextPosition,
      lastSentPosition,
      daysSinceLastSent,
    };
  }

  if (dueIn > 1) {
    return {
      light: "slate",
      label: lastSentPosition > 0
        ? `FU ${lastSentPosition} sent ${daysSinceLastSent}d ago`
        : `FU 1 in ${dueIn}d`,
      reason: lastSentPosition > 0
        ? `Last follow-up fired ${daysSinceLastSent}d ago. FU ${nextPosition} is due in ${dueIn} days.`
        : `Wait until ${dueDay} days after send. Currently ${daysSinceSent}d since sent.`,
      nextPosition,
      lastSentPosition,
      daysSinceLastSent,
    };
  }

  if (dueIn >= -1) {
    return {
      light: "amber",
      label: `Ready to send FU ${nextPosition}`,
      reason: lastSentPosition > 0
        ? `${daysSinceSent}d since send, ${daysSinceLastSent}d since last nudge - send FU ${nextPosition} now.`
        : `${daysSinceSent}d since send - time for the first nudge.`,
      nextPosition,
      lastSentPosition,
      daysSinceLastSent,
    };
  }

  // dueIn < -1: overdue
  return {
    light: "rose",
    label: `FU ${nextPosition} overdue ${Math.abs(dueIn)}d`,
    reason: `Should have nudged ${Math.abs(dueIn)} days ago. Send FU ${nextPosition} or call them.`,
    nextPosition,
    lastSentPosition,
    daysSinceLastSent,
  };
}

/** Insert one log row. Called the moment the operator picks a send
 *  channel (Gmail / Outlook / mailto / Clipboard / WhatsApp) on the
 *  follow-up compose drawer. */
export async function recordFollowupSent(args: {
  companyId: string;
  quoteId: string;
  position: number;
  templateKey: string;
  channel: FollowupChannel;
  sentByUserId: string | null;
  notes?: string | null;
  status?: FollowupStatus;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase as any).from("quote_followup_log").insert({
    company_id: args.companyId,
    quote_id: args.quoteId,
    sequence_position: args.position,
    template_key: args.templateKey,
    channel: args.channel,
    status: args.status ?? "sent",
    sent_by_user_id: args.sentByUserId,
    notes: args.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Bulk-load logs for a list of quote ids. Used by the Quotes page
 *  to compute every row's pill state in one round-trip. */
export async function loadFollowupLogsForQuotes(
  quoteIds: string[],
): Promise<Record<string, FollowupLogRow[]>> {
  if (quoteIds.length === 0) return {};
  const { data, error } = await (supabase as any)
    .from("quote_followup_log")
    .select("id, quote_id, sequence_position, template_key, channel, status, sent_at")
    .in("quote_id", quoteIds);
  if (error) {
    console.error("loadFollowupLogsForQuotes failed:", error);
    return {};
  }
  const byQuote: Record<string, FollowupLogRow[]> = {};
  for (const r of (data || []) as FollowupLogRow[]) {
    (byQuote[r.quote_id] = byQuote[r.quote_id] || []).push(r);
  }
  return byQuote;
}

/** Read the cadence from the operator's saved automation settings.
 *  Falls back to the DEFAULT_FOLLOWUP_CADENCE when nothing's saved. */
export function readCadenceFromAdminSettings(): FollowupCadence {
  if (typeof window === "undefined") return DEFAULT_FOLLOWUP_CADENCE;
  try {
    const raw = window.localStorage.getItem("admin_settings");
    if (!raw) return DEFAULT_FOLLOWUP_CADENCE;
    const s = JSON.parse(raw);
    const first = Number(s?.automation?.autoFollowUpDays);
    const second = Number(s?.automation?.secondFollowUpDays);
    const third = Number(s?.automation?.thirdFollowUpDays);
    return {
      firstAfterDays: Number.isFinite(first) && first > 0 ? first : DEFAULT_FOLLOWUP_CADENCE.firstAfterDays,
      secondAfterDays: Number.isFinite(second) && second > 0 ? second : DEFAULT_FOLLOWUP_CADENCE.secondAfterDays,
      thirdAfterDays: Number.isFinite(third) && third > 0 ? third
        : (Number.isFinite(second) && second > 0 ? second * 2 : DEFAULT_FOLLOWUP_CADENCE.thirdAfterDays),
    };
  } catch {
    return DEFAULT_FOLLOWUP_CADENCE;
  }
}

export const TRAFFIC_LIGHT_CLASS: Record<FollowupTrafficLight, string> = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  rose:  "bg-rose-100 text-rose-700 border-rose-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};
