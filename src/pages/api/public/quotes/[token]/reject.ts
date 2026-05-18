/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/public/quotes/[token]/reject
 *
 * Client-side quote decline. /q/[token] -> Decline button.
 *
 * Wave 70.50b: refactored to call markQuoteAsLost() so admin "Mark as
 * lost" and client decline use the same code path with identical side
 * effects (status flip + lead flip + email + notify + audit). The two
 * paths had drifted - admin lost flow skipped the lead flip, email,
 * and notification.
 *
 * Body:
 *   {
 *     reason?: string,       // optional free-text client note
 *     lost_reason?: string,  // optional structured category (Wave 70.50b)
 *                            // defaults to 'no_response' if missing --
 *                            // the most accurate default for an
 *                            // unprompted decline.
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  markQuoteAsLost,
  isValidLostReason,
  type LostReason,
} from "@/services/quote/markQuoteAsLost";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!token) return res.status(400).json({ ok: false, error: "token required" });

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
  const reasonNote = typeof body.reason === "string"
    ? body.reason.trim().slice(0, 1000)
    : null;
  // Default to 'no_response' - captures the most-common "I never
  // heard back" decline pattern. Caller can pass a more-specific
  // value (the client UI may add a dropdown later in Wave 70.51).
  const lostReason: LostReason = isValidLostReason(body.lost_reason)
    ? body.lost_reason
    : "no_response";

  const sb = getServiceSupabase();
  const result = await markQuoteAsLost({
    match: { kind: "token", public_token: token },
    reason: lostReason,
    reason_note: reasonNote,
    actor: "client",
    actor_user_id: null,
    sb,
  });

  if (!result.ok) {
    // Distinguish "not found" from other errors so the page can show
    // the right copy.
    const code = result.error?.toLowerCase().includes("not found") ? 404 : 500;
    return res.status(code).json({ ok: false, error: result.error || "Decline failed" });
  }

  if (result.flipped === false && result.alreadyTerminal) {
    // Idempotent re-call - the page may double-fire if the user clicks
    // twice fast. Respond 200 so the UI shows success.
    return res.status(200).json({ ok: true, alreadyRejected: true, quoteId: result.quote_id });
  }

  return res.status(200).json({
    ok: true,
    quoteId: result.quote_id,
    receipt: result.receipt,
  });
}
