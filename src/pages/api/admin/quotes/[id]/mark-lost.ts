/**
 * POST /api/admin/quotes/[id]/mark-lost -- Wave 70.50b
 *
 * Admin / owner manual loss flip. Routes through the same
 * markQuoteAsLost() helper as the client-decline endpoint so both
 * paths produce identical side effects (status flip + structured
 * lost_reason + lead flip + operator notification + audit log).
 *
 * Body:
 *   {
 *     lost_reason: 'price' | 'timing' | 'capacity' | 'weather' |
 *                  'force_majeure' | 'no_response' |
 *                  'won_by_competitor' | 'client_changed_plans' |
 *                  'order_cancelled' | 'other',
 *     reason_note?: string,
 *   }
 *
 * Auth: admin/owner of the quote's company. Returns the receipt so
 * the UI can show which side effects landed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  markQuoteAsLost,
  isValidLostReason,
  type LostReason,
} from "@/services/quote/markQuoteAsLost";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const quoteId = String(req.query.id || "");
    if (!quoteId) return res.status(400).json({ error: "Quote id is required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "").toString().toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }
    const callerCompanyId = (profile as any)?.company_id as string | undefined;

    const body = (req.body || {}) as any;
    const lostReasonInput = body.lost_reason;
    if (!isValidLostReason(lostReasonInput)) {
      return res.status(400).json({
        error: "lost_reason is required and must be one of: price, timing, capacity, weather, force_majeure, no_response, won_by_competitor, client_changed_plans, order_cancelled, other",
      });
    }
    const lostReason = lostReasonInput as LostReason;
    const reasonNote = typeof body.reason_note === "string"
      ? body.reason_note.trim().slice(0, 1000)
      : null;

    // Tenant gate before invoking the helper -- the helper itself uses
    // service role so it would otherwise happily flip any tenant's
    // quote. Read company_id via SSR (RLS-permitted) so we get a clean
    // "wrong company" failure if the caller's profile doesn't match.
    const { data: quoteRow } = await ssr
      .from("quotes")
      .select("id, company_id")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!quoteRow) {
      return res.status(404).json({ error: "Quote not found (or you can't see it)." });
    }
    if (role !== "super_admin" && (quoteRow as any).company_id !== callerCompanyId) {
      return res.status(403).json({ error: "Wrong company" });
    }

    const sb = getServiceSupabase();
    const result = await markQuoteAsLost({
      match: { kind: "id", quote_id: quoteId },
      reason: lostReason,
      reason_note: reasonNote,
      actor: "admin",
      actor_user_id: user.id,
      sb,
    });

    if (!result.ok) {
      return res.status(500).json({ error: result.error || "Mark-lost failed" });
    }

    if (result.flipped === false && result.alreadyTerminal) {
      return res.status(200).json({
        ok: true,
        already_terminal: true,
        quote_id: result.quote_id,
      });
    }

    return res.status(200).json({
      ok: true,
      quote_id: result.quote_id,
      receipt: result.receipt,
    });
  } catch (err: any) {
    console.error("[admin/quotes/mark-lost] crashed:", err);
    return res.status(500).json({ error: err?.message || "Mark-lost failed" });
  }
}
