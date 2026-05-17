/**
 * markQuoteAsLost -- Wave 70.50b
 *
 * Single chokepoint for "this quote isn't going to happen, close it
 * out properly". Replaces the two parallel implementations:
 *
 *   1. /api/public/quotes/[token]/reject.ts -- client decline (Wave 21+).
 *      Full side effects: lead flip, operator notification, client
 *      confirmation email, audit log.
 *   2. /admin/quotes/index.tsx handleMarkAsLost -- admin manual flip
 *      (Phase 11 #6). Bare status flip + optional audit log. None of
 *      the rich side effects of the client path.
 *
 * The two paths diverged silently. Admin-initiated losses had no lead
 * flip, no notification, no email. So sales managers using the admin
 * funnel saw "lost" quotes that left the linked lead at "quoted",
 * inflating the pipeline indefinitely.
 *
 * This helper owns ONE rich path; both callers route through it.
 * Wave 70.50a's structured `lost_reason` enum flows through here so
 * the loss is aggregable in the funnel + reporting.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type LostReason =
  | "price"
  | "timing"
  | "capacity"
  | "weather"
  | "force_majeure"
  | "no_response"
  | "won_by_competitor"
  | "client_changed_plans"
  | "order_cancelled"
  | "other";

export interface MarkQuoteAsLostOpts {
  /** Quote ID OR public_token. Specify which via `match`. */
  match: { kind: "id"; quote_id: string } | { kind: "token"; public_token: string };
  /** Structured loss category. Required -- the whole point of this
   *  refactor is to stop losing the why. */
  reason: LostReason;
  /** Free-text explanation. Optional; appended to quotes.notes. */
  reason_note?: string | null;
  /** Who initiated the flip. Drives email copy + audit shape. */
  actor: "client" | "admin" | "system";
  /** auth.uid() of the admin (when actor === 'admin'). Null otherwise. */
  actor_user_id?: string | null;
  /** Service-role Supabase client. */
  sb: any;
}

export interface MarkQuoteAsLostResult {
  ok: boolean;
  /** True when the row matched + flipped. False when already terminal
   *  (idempotent re-call) or not found. */
  flipped: boolean;
  /** True when a matching row existed but was already in a terminal
   *  state (rejected / expired). The caller's UI can show "already
   *  closed" rather than "no quote found". */
  alreadyTerminal?: boolean;
  quote_id?: string;
  error?: string;
  /** Side-effect summary for the audit row + caller logging. */
  receipt: {
    status_flipped: boolean;
    notes_appended: boolean;
    lead_flipped: boolean;
    email_sent: boolean;
    operator_notified: boolean;
    audit_logged: boolean;
  };
}

const VALID_REASONS: ReadonlyArray<LostReason> = [
  "price",
  "timing",
  "capacity",
  "weather",
  "force_majeure",
  "no_response",
  "won_by_competitor",
  "client_changed_plans",
  "order_cancelled",
  "other",
];

export function isValidLostReason(value: unknown): value is LostReason {
  return typeof value === "string" && (VALID_REASONS as readonly string[]).includes(value);
}

/**
 * Atomic quote-loss flip + full cascade. Idempotent: second call on
 * the same already-rejected quote returns ok=true, flipped=false,
 * alreadyTerminal=true with no side-effect re-fire.
 *
 * Side effects (each is best-effort; one failure never undoes another):
 *   1. quotes.status -> 'rejected', lost_reason, rejected_at, notes append
 *   2. leads.status -> 'lost' (linked via lead_id; only if non-terminal)
 *   3. Client confirmation email (when actor='client' AND client_email set,
 *      OR when actor='admin' AND email not suppressed)
 *   4. Operator notification (broadcastNotification, priority=normal)
 *   5. audit_logs row with full context
 *
 * The receipt structure lets the caller see WHICH side effects actually
 * landed -- useful when a stale row prevented the flip but the audit
 * insert still succeeded, etc.
 */
export async function markQuoteAsLost(opts: MarkQuoteAsLostOpts): Promise<MarkQuoteAsLostResult> {
  const { reason, reason_note, actor, actor_user_id, sb } = opts;
  const nowIso = new Date().toISOString();
  const receipt = {
    status_flipped: false,
    notes_appended: false,
    lead_flipped: false,
    email_sent: false,
    operator_notified: false,
    audit_logged: false,
  };

  if (!isValidLostReason(reason)) {
    return { ok: false, flipped: false, error: `Invalid lost_reason: ${reason}`, receipt };
  }

  // ── 1. atomic flip ─────────────────────────────────────────────────
  // Match clause depends on caller. Both paths gate on non-terminal
  // status so a second click is a no-op.
  let updateQuery = sb
    .from("quotes")
    .update({
      status: "rejected",
      lost_reason: reason,
      rejected_at: nowIso,
      updated_at: nowIso,
    })
    .is("deleted_at", null)
    .in("status", ["draft", "sent", "viewed", "revised", "accepted"]);
  if (opts.match.kind === "id") {
    updateQuery = updateQuery.eq("id", opts.match.quote_id);
  } else {
    updateQuery = updateQuery.eq("public_token", opts.match.public_token);
  }
  const { data: updated, error: updateErr } = await updateQuery
    .select("id, company_id, client_name, client_email, quote_number, event_date, lead_id")
    .maybeSingle();

  if (updateErr) {
    return { ok: false, flipped: false, error: updateErr.message, receipt };
  }

  if (!updated) {
    // No row matched -- check whether quote exists but is already terminal.
    let existsQuery = sb
      .from("quotes")
      .select("id, status, company_id")
      .is("deleted_at", null);
    if (opts.match.kind === "id") {
      existsQuery = existsQuery.eq("id", opts.match.quote_id);
    } else {
      existsQuery = existsQuery.eq("public_token", opts.match.public_token);
    }
    const { data: existing } = await existsQuery.maybeSingle();
    if (existing && ["rejected", "expired"].includes((existing as any).status)) {
      return {
        ok: true,
        flipped: false,
        alreadyTerminal: true,
        quote_id: (existing as any).id,
        receipt,
      };
    }
    return { ok: false, flipped: false, error: "Quote not found or in unflippable state", receipt };
  }

  receipt.status_flipped = true;
  const quoteId = (updated as any).id as string;
  const companyId = (updated as any).company_id as string;
  const leadId = (updated as any).lead_id as string | null;
  const clientName = (updated as any).client_name as string | null;
  const clientEmail = (updated as any).client_email as string | null;
  const quoteNumber = (updated as any).quote_number as string | null;
  const eventDate = (updated as any).event_date as string | null;

  // ── 2. notes append (when reason_note supplied) ────────────────────
  // Mirrors the existing public reject path. Free-text reason lands
  // alongside the structured lost_reason so the operator has BOTH
  // (the category and the explanation).
  if (reason_note && reason_note.trim()) {
    try {
      const { data: cur } = await sb
        .from("quotes")
        .select("notes")
        .eq("id", quoteId)
        .maybeSingle();
      const stamp = new Date(nowIso).toLocaleString("en-ZA", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const actorLabel = actor === "client" ? "Client declined"
                       : actor === "admin"  ? "Admin marked lost"
                                            : "System closed";
      const append = `\n\n${actorLabel} ${stamp} (${reason}): ${reason_note.trim()}`;
      const newNotes = ((cur as any)?.notes || "") + append;
      await sb.from("quotes").update({ notes: newNotes }).eq("id", quoteId);
      receipt.notes_appended = true;
    } catch (e) {
      console.warn("[markQuoteAsLost] notes append failed:", e);
    }
  }

  // ── 3. lead flip ───────────────────────────────────────────────────
  // Only when the quote has a linked lead AND it's still non-terminal.
  // Stores the structured reason on the lead too so the lead-source
  // funnel can aggregate "we keep losing weather quotes" or whatever
  // pattern emerges.
  if (leadId) {
    try {
      const { data: leadUpdated } = await sb
        .from("leads")
        .update({
          status: "lost",
          lost_reason: reason,
          lost_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", leadId)
        .in("status", ["new", "contacted", "qualified", "quoted", "negotiating"])
        .select("id")
        .maybeSingle();
      if (leadUpdated) receipt.lead_flipped = true;
    } catch (e) {
      console.warn("[markQuoteAsLost] lead flip failed:", e);
    }
  }

  // ── 4. operator notification ───────────────────────────────────────
  try {
    const { notificationService } = await import("@/services/notificationService");
    const { UserRole } = await import("@/types/app");
    const evtLabel = eventDate
      ? new Date(eventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
      : "TBD";
    const reasonLabel = reason.replace(/_/g, " ");
    const noteSnippet = reason_note
      ? ` Note: "${reason_note.slice(0, 140)}${reason_note.length > 140 ? "..." : ""}"`
      : "";
    const actorVerb = actor === "client" ? "declined" : "marked lost";
    await (notificationService as any).broadcastNotification({
      companyId,
      type: "quote_rejected",
      title: actor === "client" ? "Quote declined" : "Quote marked lost",
      message: `${clientName || "The client"}'s quote ${quoteNumber || ""} (event ${evtLabel}) ${actorVerb}. Reason: ${reasonLabel}.${noteSnippet}`,
      priority: "normal",
      link: `/admin/quotes/${quoteId}`,
      relatedEntityType: "quote",
      relatedEntityId: quoteId,
      targetRoles: [
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
        "owner" as any,
      ],
    }, sb);
    receipt.operator_notified = true;
  } catch (e) {
    console.warn("[markQuoteAsLost] notify failed:", e);
  }

  // ── 5. client confirmation email ───────────────────────────────────
  // Client-decline always emails (Wave 22). Admin mark-lost defaults
  // to NO email (operator usually closing it after a phone call;
  // emailing "we closed your quote" would be jarring) but the caller
  // could opt-in by passing actor='admin' and adding their own
  // explicit email send. For 70.50b we keep parity with the prior
  // behaviour: only the client path sends.
  if (actor === "client" && clientEmail) {
    try {
      const { data: companyRow } = await sb
        .from("companies")
        .select("company_name")
        .eq("id", companyId)
        .maybeSingle();
      const companyName = (companyRow as any)?.company_name || "the team";
      const firstName = String(clientName || "").trim().split(" ")[0] || "there";
      const reasonLine = reason_note ? `Your note: "${reason_note}"\n\n` : "";
      const { emailService } = await import("@/services/emailService");
      await (emailService as any).sendEmail({
        companyId,
        to: clientEmail,
        subject: `Quote ${quoteNumber || ""} -- declined`,
        body:
          `Hi ${firstName},\n\n` +
          `This confirms that you've declined quote ${quoteNumber || ""}. We've closed it on our side -- no follow-ups coming.\n\n` +
          reasonLine +
          `If your plans change, just reply to this email and we'll work out a fresh quote.\n\n` +
          `Thanks,\n${companyName}`,
        bypassQuarantine: true,
        _client: sb,
      });
      receipt.email_sent = true;
    } catch (e) {
      console.warn("[markQuoteAsLost] confirmation email failed:", e);
    }
  }

  // ── 6. audit log ────────────────────────────────────────────────────
  try {
    await sb.from("audit_logs").insert({
      company_id: companyId,
      user_id: actor_user_id ?? null,
      action: actor === "client" ? "quote_rejected" : "quote_marked_lost",
      entity_type: "quote",
      entity_id: quoteId,
      details: {
        quote_number: quoteNumber,
        client_email: clientEmail,
        lead_id: leadId,
        actor,
        lost_reason: reason,
        reason_note: reason_note || null,
        receipt,
      },
    });
    receipt.audit_logged = true;
  } catch (e) {
    console.warn("[markQuoteAsLost] audit insert failed:", e);
  }

  return { ok: true, flipped: true, quote_id: quoteId, receipt };
}
