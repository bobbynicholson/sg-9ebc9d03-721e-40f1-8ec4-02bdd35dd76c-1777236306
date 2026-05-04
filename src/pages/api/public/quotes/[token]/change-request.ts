/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
  verifyTurnstile,
} from "@/lib/embedFormApi";

/**
 * POST /api/public/quotes/[token]/change-request
 *
 * Public, unauthenticated. Records a tweak request from the client on
 * the public quote view.
 *
 * Hardening:
 *   - 16KB body cap (the form has one freeform message + a few short
 *     structured fields)
 *   - Honeypot: silent 200 if filled
 *   - Token-scoped rate limit (5/hour/ip per quote, 20/hour/ip total)
 *   - Per-quote lifetime cap of 10 requests so a malicious forwarder
 *     can't weaponise the form into a notification flood
 *   - company_id derived server-side from quote, never trusted from body
 */

const MAX_MESSAGE = 4000;
const MIN_MESSAGE = 10;
const MAX_NAME = 200;
const MAX_PER_QUOTE_LIFETIME = 10;

export const config = {
  api: { bodyParser: { sizeLimit: "16kb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, error: "Not found" });

  const body = (req.body || {}) as Record<string, any>;

  // Honeypot -- silent success to avoid signalling bots.
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";
  if (honeypot.trim().length > 0) return res.status(200).json({ ok: true });

  const message =
    typeof body.message === "string"
      ? body.message.trim().slice(0, MAX_MESSAGE)
      : "";
  if (message.length < MIN_MESSAGE) {
    return res.status(400).json({
      ok: false,
      error: `Please give us at least ${MIN_MESSAGE} characters so we know what to change.`,
    });
  }

  const submitterName =
    typeof body.submitterName === "string"
      ? body.submitterName.trim().slice(0, MAX_NAME)
      : null;

  // Optional structured tweaks. Whitelist keys so a bad client can't
  // pollute the jsonb column with arbitrary data.
  const rawChanges =
    body.requestedChanges && typeof body.requestedChanges === "object"
      ? body.requestedChanges
      : {};
  const requestedChanges: Record<string, any> = {};
  if (typeof rawChanges.event_date === "string" && rawChanges.event_date) {
    requestedChanges.event_date = rawChanges.event_date.slice(0, 64);
  }
  if (typeof rawChanges.guest_count === "number" && Number.isFinite(rawChanges.guest_count)) {
    requestedChanges.guest_count = Math.max(0, Math.min(99999, Math.round(rawChanges.guest_count)));
  } else if (typeof rawChanges.guest_count === "string" && rawChanges.guest_count.trim()) {
    const n = parseInt(rawChanges.guest_count, 10);
    if (Number.isFinite(n)) requestedChanges.guest_count = Math.max(0, Math.min(99999, n));
  }
  if (typeof rawChanges.menu_changes === "string" && rawChanges.menu_changes.trim()) {
    requestedChanges.menu_changes = rawChanges.menu_changes.trim().slice(0, 2000);
  }

  const supabase = getServiceSupabase();
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? (req.headers["user-agent"] as string).slice(0, 500)
      : null;

  // Turnstile -- only enforced when TURNSTILE_SECRET_KEY is set in the
  // environment. Mirrors the embed-form pattern so dev / test envs
  // (without the secret) keep working unchanged. When configured, a
  // failed challenge returns 200 ok:false rather than 4xx so bots get
  // no signal about which check tripped them.
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const result = await verifyTurnstile(turnstileToken, turnstileSecret, ip);
    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        error: "Challenge failed, please refresh and try again.",
      });
    }
  }

  // Rate limit -- tighter than view since this fans out to admin
  // notifications.
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 10,
    bucket: "hour",
  });
  if (!rl.allowed) {
    return res.status(429).json({
      ok: false,
      error: "Too many requests, please wait a bit before sending another.",
    });
  }

  // Resolve quote.
  const { data: quote } = await (supabase as any)
    .from("quotes")
    .select("id, company_id, user_id, lead_id, client_name, total, currency, event_date, deleted_at")
    .eq("public_token", token)
    .maybeSingle();

  if (!quote || quote.deleted_at) return res.status(404).json({ ok: false, error: "Quote not found" });

  // Per-quote lifetime cap.
  const { count } = await (supabase as any)
    .from("quote_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quote.id);
  if (typeof count === "number" && count >= MAX_PER_QUOTE_LIFETIME) {
    return res.status(429).json({
      ok: false,
      error: `You've sent ${MAX_PER_QUOTE_LIFETIME} change requests on this quote. Please contact us directly for further changes.`,
    });
  }

  // Insert -- company_id always derived from the quote, never from
  // body, so a token holder can't pollute another tenant.
  const { data: inserted, error: insertErr } = await (supabase as any)
    .from("quote_change_requests")
    .insert([{
      company_id: quote.company_id,
      quote_id: quote.id,
      lead_id: quote.lead_id || null,
      message,
      requested_changes: Object.keys(requestedChanges).length > 0 ? requestedChanges : null,
      submitter_name: submitterName,
      submitter_ip_hash: ipHash,
      submitter_user_agent: userAgent,
    }])
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[public/quotes/change-request] insert failed", insertErr);
    return res.status(500).json({ ok: false, error: "Could not send your message, please try again." });
  }

  // Notify admin (best-effort).
  void (async () => {
    try {
      const totalLabel = `${quote.currency || "ZAR"} ${Number(quote.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
      const eventLabel = quote.event_date
        ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
        : "TBD";
      const summary = message.length > 140 ? message.slice(0, 137) + "..." : message;
      await supabase.from("notifications").insert([{
        company_id: quote.company_id,
        user_id: quote.user_id,
        recipient_id: quote.user_id,
        notification_type: "quote_change_request",
        title: "✏️ Client wants changes to a quote",
        message: `${submitterName || quote.client_name || "Client"} requested changes (${totalLabel}, ${eventLabel}): "${summary}"`,
        priority: "high",
        // #change-requests anchor lands the operator on the Card
        // directly -- the page's deep-link useEffect scrolls it
        // into view once the data resolves.
        link: `/admin/quotes/${quote.id}#change-requests`,
      }]);
    } catch (err) {
      console.warn("[public/quotes/change-request] notification failed", err);
    }
  })();

  return res.status(200).json({ ok: true });
}
