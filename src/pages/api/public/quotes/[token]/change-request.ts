/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
  verifyTurnstile,
} from "@/lib/embedFormApi";
import { withApiLogging } from "@/lib/withApiLogging";


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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false, error: "Not found" });

  const body = (req.body || {}) as Record<string, any>;

  // Honeypot - silent success to avoid signalling bots.
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

  // Turnstile - only enforced when TURNSTILE_SECRET_KEY is set in the
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

  // Rate limit - tighter than view since this fans out to admin
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
  const { data: quote, error: quoteErr } = await (supabase as any)
    .from("quotes")
    // Wave 12 follow-up: currency lives on companies, not quotes.
    // Selecting it here used to throw "column quotes.currency does
    // not exist" and 500 every public change-request submission.
    .select("id, company_id, user_id, lead_id, client_name, quote_number, total, event_date, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  if (quoteErr) {
    console.error("[public/quotes/[token]/change-request] quotes fetch failed:", quoteErr);
  }

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

  // Insert - company_id always derived from the quote, never from
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

  // Notify admin (best-effort). Fan out to every operator who can
  // act on the change request - the previous single-row insert only
  // hit quote.user_id, which often doesn't match the actual sales
  // owner. related_entity powers the contextual CTA on the
  // notifications page; #change-requests anchor lands the operator on
  // the right card on /admin/quotes/{id}.
  //
  // AWAITED, not fire-and-forget: on Vercel the lambda freezes as soon
  // as the response is sent, which silently killed the operator email
  // (Pic 43 - client requested changes, nothing landed in the inbox).
  // The inner try/catches keep a notification failure from breaking
  // the client's 200.
  await (async () => {
    try {
      // Resolve currency + contact email from the company.
      let currencyCode = "ZAR";
      let companyEmail: string | null = null;
      let companyName: string | null = null;
      try {
        const { data: companyRow, error: companyRowErr } = await (supabase as any)
          .from("companies")
          .select("currency, email, company_name")
          .eq("id", quote.company_id)
          .maybeSingle();
        if (companyRowErr) {
          console.error("[public/quotes/[token]/change-request] companies fetch failed:", companyRowErr);
        }
        if ((companyRow as any)?.currency) currencyCode = (companyRow as any).currency;
        if ((companyRow as any)?.email) companyEmail = (companyRow as any).email;
        if ((companyRow as any)?.company_name) companyName = (companyRow as any).company_name;
      } catch { /* fall back to ZAR */ }
      const totalLabel = `${currencyCode} ${Number(quote.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
      const eventLabel = quote.event_date
        ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
        : "TBD";
      const summary = message.length > 140 ? message.slice(0, 137) + "..." : message;

      const { data: recipients, error: recipientsErr } = await (supabase as any)
        .from("profiles")
        .select("id, role, email")
        .eq("company_id", quote.company_id)
        .in("role", ["company_admin", "admin", "sales_admin", "region_admin", "owner"]);
      if (recipientsErr) {
        console.error("[public/quotes/[token]/change-request] profiles fetch failed:", recipientsErr);
      }

      const recipientIds = ((recipients as any[]) || []).map((r) => r.id);
      // Fall back to the quote's user_id if we found no admins - this
      // matches the previous behaviour and avoids losing the alert.
      if (recipientIds.length === 0 && quote.user_id) {
        recipientIds.push(quote.user_id);
      }
      if (recipientIds.length === 0) return;

      const rows = recipientIds.map((rid: string) => ({
        company_id: quote.company_id,
        user_id: rid,
        recipient_id: rid,
        notification_type: "quote_change_request",
        title: "✏️ Client wants changes to a quote",
        message: `${submitterName || quote.client_name || "Client"} requested changes (${totalLabel}, ${eventLabel}): "${summary}"`,
        priority: "high",
        link: `/admin/quotes/${quote.id}#change-requests`,
        related_entity_type: "quote",
        related_entity_id: quote.id,
      }));
      await (supabase as any).from("notifications").insert(rows);

      // Email the operator inbox so they don't miss it. companies.email
      // is the preferred target, but plenty of tenants never fill it in
      // - in that case fall back to the admin profiles we already
      // fetched so the alert isn't silently dropped.
      const emailTargets: string[] = companyEmail
        ? [companyEmail]
        : Array.from(
            new Set(
              (((recipients as any[]) || [])
                .map((r) => (typeof r.email === "string" ? r.email.trim() : ""))
                .filter(Boolean)) as string[]
            )
          );
      if (emailTargets.length > 0) {
        const quoteRef = (quote as any).quote_number || quote.id;
        const clientLabel = submitterName || quote.client_name || "Client";
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com").replace(/\/$/, "");
        const quoteLink = `${appUrl}/admin/quotes/${quote.id}#change-requests`;

        const bodyHtml = `
          <p>Hi,</p>
          <p><strong>${clientLabel}</strong> has requested changes to quote <strong>${quoteRef}</strong> (${eventLabel} &mdash; ${totalLabel}).</p>
          <blockquote style="border-left:3px solid #e2e8f0;margin:16px 0;padding:8px 16px;color:#475569;font-style:italic">
            ${message.replace(/\n/g, "<br/>")}
          </blockquote>
          <p><a href="${quoteLink}" style="color:#4f46e5">View change request &rarr;</a></p>
          <p style="font-size:12px;color:#94a3b8">${companyName || "CateringMS"} &mdash; automated notification</p>
        `;

        for (const target of emailTargets) {
          try {
            await emailService.sendEmail({
              companyId: quote.company_id,
              to: target,
              subject: `Client change request - ${quoteRef} (${clientLabel})`,
              body: bodyHtml,
              quoteId: quote.id,
              skipUnsubscribeFooter: true,
              _client: supabase,
            } as any);
          } catch (emailErr) {
            console.warn(`[public/quotes/change-request] operator email to ${target} failed`, emailErr);
          }
        }
      } else {
        console.warn(
          `[public/quotes/change-request] no operator email target for company ${quote.company_id} - set companies.email in Settings`
        );
      }
    } catch (err) {
      console.warn("[public/quotes/change-request] notification failed", err);
    }
  })();

  return res.status(200).json({ ok: true });
}

export default withApiLogging(handler);
