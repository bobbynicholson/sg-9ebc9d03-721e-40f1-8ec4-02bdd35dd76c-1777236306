/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Centralised comms guard.
 *
 * Single source of truth for "should this message go out?". Built after
 * Agent 4's audit found that the email path was correctly gated via
 * `pages/api/send-email.ts` but every other channel (WhatsApp, driver
 * SMS, new-lead auto-reply, cancellation block-list) bypassed the
 * checks entirely. POPIA / spam compliance issue.
 *
 * Two negative gates:
 *
 *   1. blocked_contacts -- a contact deleted with the "block from
 *      future comms" toggle. Permanent unless the row is removed.
 *      Keyed on email_lower OR phone, scoped per company.
 *
 *   2. comms_paused_until -- the recipient sits on a lead or client
 *      row that came from a bulk import and the owner hasn't
 *      green-lit the batch yet. Time-bounded.
 *
 * Both checks run for every recipient. Either one returning true ⇒
 * `allowed: false` with a reason string the caller can surface.
 *
 * Cancellation comms get a `bypassPause: true` option so a refund
 * email still goes out to a paused contact, but the block list is
 * always honoured -- being on a block list is a final decision, not a
 * temporary pause.
 */
import { supabase } from "@/integrations/supabase/client";

export type CommsChannel = "email" | "whatsapp" | "sms";

export interface CommsCheckInput {
  companyId: string;
  channel: CommsChannel;
  email?: string | null;
  phone?: string | null;
  /** When true, the time-bounded quarantine pause is ignored. The
   *  block list is still honoured. Use ONLY for legally-required
   *  notices (refund, cancellation receipt). */
  bypassPause?: boolean;
}

export interface CommsCheckResult {
  allowed: boolean;
  reason?: "blocked" | "paused";
  detail?: string;
}

const ALLOWED: CommsCheckResult = { allowed: true };

/**
 * Check whether a comm to this contact is permitted right now.
 *
 * Returns `{ allowed: true }` on the happy path. On refusal, the
 * `reason` is enough for the caller to log + skip; `detail` is a
 * human-readable string for UI surfaces.
 *
 * Best-effort: if the underlying queries error, we fail OPEN (allow
 * the send). Reasoning: a transient DB blip shouldn't strand a
 * legitimate comm. The blocked_contacts row is the durable record;
 * worst case we double-send during an outage.
 */
export async function isCommsAllowed(input: CommsCheckInput): Promise<CommsCheckResult> {
  const { companyId, email, phone, bypassPause } = input;
  if (!companyId) return ALLOWED; // no company scope -- nothing to check
  if (!email && !phone) return ALLOWED; // no recipient identifier

  const emailLower = email ? email.toLowerCase().trim() : null;
  const phoneNorm = phone ? phone.replace(/[\s-()]/g, "").trim() : null;

  // ── Block list ─────────────────────────────────────────────────
  // Match on either email_lower or phone (blocked_contacts has both
  // columns). A row matching ANY recipient identifier blocks the send.
  try {
    let blockQuery = supabase
      .from("blocked_contacts")
      .select("email_lower, phone, reason")
      .eq("company_id", companyId);

    const orParts: string[] = [];
    if (emailLower) orParts.push(`email_lower.eq.${emailLower}`);
    if (phoneNorm) orParts.push(`phone.eq.${phoneNorm}`);
    if (orParts.length === 0) return ALLOWED;
    blockQuery = blockQuery.or(orParts.join(","));

    const { data: blocks } = await blockQuery;
    if (blocks && blocks.length > 0) {
      const reason = (blocks[0] as any)?.reason ?? null;
      return {
        allowed: false,
        reason: "blocked",
        detail: reason
          ? `Recipient on the company block list (${reason})`
          : "Recipient on the company block list",
      };
    }
  } catch (e) {
    console.warn("[commsGuard] block-list check failed (failing open):", e);
  }

  // ── Quarantine pause ───────────────────────────────────────────
  // Skip when the caller explicitly opts out (cancellation receipts).
  if (bypassPause) return ALLOWED;

  // The existing RPC is_comms_paused_for_email handles the email side
  // by walking leads + clients. For phone-only checks we do a direct
  // query because no equivalent RPC exists yet.
  try {
    if (emailLower) {
      const { data: paused } = await (supabase as any).rpc("is_comms_paused_for_email", {
        p_company_id: companyId,
        p_email: emailLower,
      });
      if (paused === true) {
        return {
          allowed: false,
          reason: "paused",
          detail: "Recipient is in import quarantine -- comms paused until the owner reviews the batch",
        };
      }
    }

    if (phoneNorm) {
      // Walk leads + clients looking for a row with comms_paused_until
      // in the future matching this phone. Two parallel queries keep
      // the round-trip count low.
      const nowIso = new Date().toISOString();
      const [{ data: pausedLeads }, { data: pausedClients }] = await Promise.all([
        supabase
          .from("leads")
          .select("id")
          .eq("company_id", companyId)
          .eq("phone", phoneNorm)
          .gt("comms_paused_until", nowIso)
          .limit(1),
        supabase
          .from("clients")
          .select("id")
          .eq("company_id", companyId)
          .eq("phone", phoneNorm)
          .gt("comms_paused_until", nowIso)
          .limit(1),
      ]);
      if ((pausedLeads && pausedLeads.length > 0) || (pausedClients && pausedClients.length > 0)) {
        return {
          allowed: false,
          reason: "paused",
          detail: "Recipient phone is in import quarantine -- comms paused until the owner reviews the batch",
        };
      }
    }
  } catch (e) {
    console.warn("[commsGuard] quarantine check failed (failing open):", e);
  }

  return ALLOWED;
}
