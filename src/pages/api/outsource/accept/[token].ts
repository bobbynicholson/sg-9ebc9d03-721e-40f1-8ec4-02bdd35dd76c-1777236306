/**
 * POST /api/outsource/accept/[token]
 *
 * Wave 67 Phase D -- token-bearer accept endpoint. No auth required:
 * the magic-link in the request email/WhatsApp is the credential.
 * Same pattern as the client magic-link surfaces (/c/order/[id],
 * /pay/i/[token]).
 *
 * Body: { decline?: boolean, declineReason?: string, noteFromProvider?: string }
 * Returns: { ok, status, providerName?, eventDate? } | { error }
 *
 * Idempotent: a second accept on the same token returns the current
 * state without re-stamping responded_at. A decline after accept is
 * refused (operator must reassign instead).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token || token.length < 16) {
    return res.status(400).json({ error: "Invalid token" });
  }

  let admin: any;
  try {
    admin = getServiceSupabase();
  } catch {
    return res.status(500).json({ error: "Server not configured" });
  }

  // Read the assignment + provider + order summary in one round trip
  // so the magic-link page can render the booking detail before the
  // provider commits to a tap.
  const { data: assignment, error: readErr } = await admin
    .from("outsource_assignments")
    .select(`
      id, company_id, order_id, status, requested_at, responded_at,
      service_description, required_on_site_at, scope_notes,
      quoted_cost, cost_currency, rate_type, accept_token_expires_at,
      provider:provider_id ( provider_name, contact_person ),
      order:order_id ( order_number, event_date, event_time, client_name, venue_address, guest_count )
    `)
    .eq("accept_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (readErr) {
    console.error("[outsource/accept] read failed:", readErr);
    return res.status(500).json({ error: readErr.message });
  }
  if (!assignment) {
    return res.status(404).json({ error: "Link not found or expired" });
  }

  // Belt-and-braces expiry check.
  if (assignment.accept_token_expires_at) {
    const expiry = new Date(assignment.accept_token_expires_at).getTime();
    if (Number.isFinite(expiry) && expiry < Date.now()) {
      return res.status(410).json({ error: "Link has expired -- ask the company to send a new one." });
    }
  }

  // GET path = "render the page". The Next.js page calls this to
  // populate its initial state.
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      status: assignment.status,
      providerName: (assignment.provider as any)?.provider_name || null,
      serviceDescription: assignment.service_description,
      scopeNotes: assignment.scope_notes,
      requiredOnSiteAt: assignment.required_on_site_at,
      quotedCost: Number(assignment.quoted_cost),
      costCurrency: assignment.cost_currency,
      rateType: assignment.rate_type,
      order: assignment.order,
    });
  }

  const body = (req.body || {}) as { decline?: boolean; declineReason?: string; noteFromProvider?: string };
  const isDecline = !!body.decline;
  const declineReason = typeof body.declineReason === "string" ? body.declineReason.trim().slice(0, 500) : "";
  const note = typeof body.noteFromProvider === "string" ? body.noteFromProvider.trim().slice(0, 500) : "";

  // Idempotent accept: if already accepted, return the existing
  // state without re-stamping. If already declined and they tap
  // accept, refuse -- the order may have moved on.
  if (assignment.status === "accepted" || assignment.status === "en_route" || assignment.status === "on_site" || assignment.status === "completed") {
    if (isDecline) {
      return res.status(409).json({ error: "Already accepted. Contact the company to change." });
    }
    return res.status(200).json({ ok: true, status: assignment.status, alreadyResponded: true });
  }
  if (assignment.status === "declined" || assignment.status === "cancelled") {
    return res.status(409).json({ error: `This request is ${assignment.status}. Ask the company for a fresh link.` });
  }

  const nowIso = new Date().toISOString();
  const patch: any = {
    status: isDecline ? "declined" : "accepted",
    responded_at: nowIso,
  };
  if (isDecline && declineReason) patch.decline_reason = declineReason;
  if (note) patch.notes = note;

  const { error: updErr } = await admin
    .from("outsource_assignments")
    .update(patch)
    .eq("id", assignment.id);
  if (updErr) {
    console.error("[outsource/accept] update failed:", updErr);
    return res.status(500).json({ error: updErr.message });
  }

  // Audit log so the operator sees the magic-link response in the
  // existing audit trail surface alongside admin actions.
  try {
    await admin.from("audit_logs").insert({
      company_id: assignment.company_id,
      user_id: null,
      action: isDecline ? "outsource_declined_magic_link" : "outsource_accepted_magic_link",
      entity_type: "outsource_assignment",
      entity_id: assignment.id,
      details: {
        provider_name: (assignment.provider as any)?.provider_name || null,
        order_number: (assignment.order as any)?.order_number || null,
        decline_reason: declineReason || null,
        note: note || null,
      },
    });
  } catch (auditErr) {
    console.warn("[outsource/accept] audit insert failed:", auditErr);
  }

  return res.status(200).json({
    ok: true,
    status: patch.status,
    providerName: (assignment.provider as any)?.provider_name || null,
    eventDate: (assignment.order as any)?.event_date || null,
  });
}
