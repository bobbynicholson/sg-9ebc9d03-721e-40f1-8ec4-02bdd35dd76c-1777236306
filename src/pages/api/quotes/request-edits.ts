/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/quotes/request-edits
 *
 * The client read the quote and wants changes before they accept. We:
 *   1. Verify the caller owns the quote (via clients.user_id link
 *      under the same tenant).
 *   2. Flip the quote status to 'revised' so it surfaces on the
 *      admin's "needs work" pile rather than the "sent and waiting"
 *      pile. The admin then revises and re-sends.
 *   3. Append the client's note to quotes.notes with a timestamp
 *      so the admin sees exactly what was asked for, in order.
 *   4. Notify every admin/sales_admin/region_admin on the tenant
 *      with the quote number + a snippet of the request so they
 *      can triage without opening the quote.
 *
 * Idempotent on rapid duplicate clicks via a 60-second window check
 * against the last note added to this quote.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: "Sign in first" });
    }

    const { quote_id, request_text } = req.body || {};
    if (typeof quote_id !== "string" || !/^[0-9a-f-]{36}$/i.test(quote_id)) {
      return res.status(400).json({ error: "Invalid quote" });
    }
    const text = typeof request_text === "string" ? request_text.trim().slice(0, 1000) : "";
    if (text.length < 3) {
      return res.status(400).json({ error: "Tell the team what you'd like changed" });
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve the quote and confirm ownership. Quotes have either
    // client_id or client_email -- we check both because pre-signup
    // quotes only have the email.
    const { data: quote, error: qErr } = await admin
      .from("quotes")
      .select("id, company_id, client_id, client_email, quote_number, status, notes, deleted_at")
      .eq("id", quote_id)
      .maybeSingle();
    if (qErr || !quote || quote.deleted_at) {
      return res.status(404).json({ error: "Quote not found" });
    }
    if (quote.status === "accepted" || quote.status === "rejected" || quote.status === "expired") {
      return res.status(409).json({ error: `Quote is ${quote.status} -- nothing to revise` });
    }

    // Ownership check: either there's a clients row this user owns
    // under the quote's company that matches client_id, OR the quote
    // was sent to the user's email (orphan quote pre-signup).
    let owns = false;
    if (quote.client_id) {
      const { data: ownership } = await admin
        .from("clients")
        .select("id")
        .eq("id", quote.client_id)
        .eq("user_id", user.id)
        .eq("company_id", quote.company_id)
        .maybeSingle();
      if (ownership) owns = true;
    }
    if (!owns && quote.client_email && user.email && quote.client_email.toLowerCase() === user.email.toLowerCase()) {
      owns = true;
    }
    if (!owns) {
      return res.status(403).json({ error: "Not your quote" });
    }

    // Idempotency: don't double-append on rapid retries. We look for
    // a "Client edits requested" line added in the last 60 seconds.
    const recentMarker = "Client edits requested at ";
    if (typeof quote.notes === "string") {
      const lastIndex = quote.notes.lastIndexOf(recentMarker);
      if (lastIndex >= 0) {
        const tsLine = quote.notes.slice(lastIndex + recentMarker.length, lastIndex + recentMarker.length + 25);
        const ts = Date.parse(tsLine);
        if (!Number.isNaN(ts) && Date.now() - ts < 60_000) {
          return res.status(200).json({ ok: true, deduped: true });
        }
      }
    }

    const stamp = new Date().toISOString();
    const appendBlock = `\n\n${recentMarker}${stamp}\n${text}`;
    const newNotes = (quote.notes || "") + appendBlock;

    const { error: updErr } = await admin
      .from("quotes")
      .update({
        status: "revised",
        notes: newNotes,
        updated_at: stamp,
      })
      .eq("id", quote.id);
    if (updErr) {
      console.error("request-edits: update failed", updErr);
      return res.status(500).json({ error: updErr.message });
    }

    // Fan out admin notifications. One row per recipient.
    try {
      const { data: recipients } = await admin
        .from("profiles")
        .select("id")
        .eq("company_id", quote.company_id)
        .in("role", ["company_admin", "admin", "sales_admin", "region_admin"]);
      const recipientIds = ((recipients as any[]) || []).map((r) => r.id);
      if (recipientIds.length > 0) {
        // Store the full request text in the notification message so
        // the admin can read everything without bouncing to the quote
        // page first. Capped only by the input validation upstream
        // (1000 chars). The notifications page renders the message
        // verbatim and exposes Edit Quote / View buttons so the admin
        // can act without copying the message anywhere.
        const rows = recipientIds.map((rid) => ({
          company_id: quote.company_id,
          recipient_id: rid,
          user_id: rid,
          notification_type: "quote_changes_requested",
          title: "✏ Client wants changes on a quote",
          message: `${quote.quote_number}: "${text}"`,
          priority: "high",
          link: `/admin/quotes?quoteId=${encodeURIComponent(quote.id)}`,
          related_entity_type: "quote",
          related_entity_id: quote.id,
          channels: ["in_app"],
        }));
        await admin.from("notifications").insert(rows);
      }
    } catch (e) {
      console.error("request-edits: notification fanout failed", e);
    }

    return res.status(201).json({ ok: true });
  } catch (e: any) {
    console.error("request-edits crashed:", e);
    return res.status(500).json({ error: e?.message || "Unexpected server error" });
  }
}
