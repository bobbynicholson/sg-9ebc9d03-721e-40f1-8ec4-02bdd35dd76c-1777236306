/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/public/quotes/[token]/reject
 *
 * Wave 21 audit: /q/[token] only had Accept and Request-changes
 * buttons. Clients who decided not to go ahead had to email "no
 * thanks" which often went unanswered, and the quote sat in the
 * operator's In-play bucket until it expired -- masking the
 * conversion-rate stats and clogging the follow-up queue.
 *
 * This endpoint flips the quote to status='rejected' and notifies
 * the operator. Lightweight: no refund logic, no order side-effects
 * (the quote was never accepted). The atomic UPDATE...WHERE status IN
 * (...) gates against double-firing the way the accept handler does.
 *
 * Body: { reason?: string }   // optional client note
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!token) return res.status(400).json({ ok: false, error: "token required" });

  const reason = req.body && typeof req.body.reason === "string"
    ? req.body.reason.trim().slice(0, 1000)
    : null;

  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();

  // Atomic flip -- only matches a non-terminal row, so a second click
  // (or a race with the operator manually marking it accepted) returns
  // 200 idempotent without firing the side-effects again.
  const { data: updated, error } = await (supabase as any)
    .from("quotes")
    .update({
      status: "rejected",
      // No rejected_at column on quotes today; the status flip is
      // the trail. updated_at carries the timestamp.
      updated_at: nowIso,
    })
    .eq("public_token", token)
    .is("deleted_at", null)
    .in("status", ["draft", "sent", "viewed"])
    .select("id, company_id, user_id, client_name, quote_number, event_date")
    .maybeSingle();

  if (error) {
    console.error("[public/quotes/reject] update failed", { token, error });
    return res.status(500).json({ ok: false, error: "Couldn't decline this quote right now. Please try again or contact the caterer." });
  }
  if (!updated) {
    // No row matched -- either bad token or already terminal.
    const { data: existsCheck } = await (supabase as any)
      .from("quotes")
      .select("id, status")
      .eq("public_token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (existsCheck?.status === "rejected") {
      return res.status(200).json({ ok: true, alreadyRejected: true, quoteId: existsCheck.id });
    }
    if (existsCheck?.status === "accepted") {
      return res.status(409).json({ ok: false, error: "This quote was already accepted -- contact the caterer to cancel." });
    }
    if (existsCheck?.status === "expired") {
      return res.status(409).json({ ok: false, error: "This quote has expired." });
    }
    return res.status(404).json({ ok: false, error: "Quote not found." });
  }

  // Capture the client note alongside the quote for the operator.
  // We don't have a dedicated rejection_reason column, so we append
  // to notes with a clear separator -- mirrors the request-edits path.
  if (reason) {
    void (async () => {
      try {
        const { data: cur } = await (supabase as any)
          .from("quotes")
          .select("notes")
          .eq("id", updated.id)
          .maybeSingle();
        const stamp = new Date(nowIso).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
        const append = `\n\nClient declined ${stamp}: ${reason}`;
        await (supabase as any)
          .from("quotes")
          .update({ notes: ((cur as any)?.notes || "") + append })
          .eq("id", updated.id);
      } catch (e) {
        console.warn("[public/quotes/reject] notes append failed:", e);
      }
    })();
  }

  // Notify the operator. Same broadcast pattern as accept; less urgent
  // (rejected = closed, no money to chase) so priority=normal.
  void (async () => {
    try {
      const { notificationService } = await import("@/services/notificationService");
      const { UserRole } = await import("@/types/app");
      const evtLabel = updated.event_date
        ? new Date(updated.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
        : "TBD";
      const reasonSnippet = reason
        ? ` Reason: "${reason.slice(0, 140)}${reason.length > 140 ? "..." : ""}"`
        : "";
      await (notificationService as any).broadcastNotification({
        companyId: updated.company_id,
        type: "quote_rejected",
        title: "Quote declined",
        message: `${updated.client_name || "The client"} declined quote ${updated.quote_number} (event ${evtLabel}).${reasonSnippet}`,
        priority: "normal",
        link: `/admin/quotes/${updated.id}`,
        relatedEntityType: "quote",
        relatedEntityId: updated.id,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as any,
        ],
      });
    } catch (e) {
      console.warn("[public/quotes/reject] notify failed:", e);
    }
  })();

  return res.status(200).json({ ok: true, quoteId: updated.id });
}
