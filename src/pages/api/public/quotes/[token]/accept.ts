/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";
import { withApiLogging } from "@/lib/withApiLogging";


/**
 * POST /api/public/quotes/[token]/accept
 *
 * Public, unauthenticated. Records the acceptance:
 *   1. Stamps quotes.accepted_at + status = 'accepted'
 *   2. Inserts a quote_acceptances audit row (acceptor name, IP hash, UA)
 *   3. Fires admin notifications (in-app + email + WhatsApp best-effort)
 *
 * Service role only - the anon client cannot insert into notifications
 * (tenant_create_notifications RLS blocks anon) or quote_acceptances
 * (no anon policy), and the quotes UPDATE policy was tightened so anon
 * can no longer flip accepted_at directly.
 */

const MAX_NAME = 200;

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } },
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
  const acceptorName =
    typeof body.acceptedByName === "string"
      ? body.acceptedByName.trim().slice(0, MAX_NAME)
      : "";
  if (!acceptorName) {
    return res.status(400).json({ ok: false, error: "Please enter your name." });
  }

  const supabase = getServiceSupabase();
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? (req.headers["user-agent"] as string).slice(0, 500)
      : null;

  // Tight-ish rate limit on accepts. Legit usage is 1; >5/hr per IP per
  // token is almost certainly a script.
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 5,
    bucket: "hour",
  });
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: "Too many attempts, try again later." });
  }

  // Audit (May 2026, Wave 3): the endpoint previously stamped
  // accepted_at + status='accepted' on ANY quote matching the token,
  // even if it was already rejected, expired or past valid_until.
  // A client (or anyone with the token) could re-accept stale pricing
  // weeks later. Gate the acceptance on a fresh status check first.
  const { data: existing, error: existingErr } = await (supabase as any)
    .from("quotes")
    .select("id, status, valid_until, converted_to_order_id")
    .eq("public_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingErr) {
    console.error("[public/quotes/[token]/accept] quotes fetch failed:", existingErr);
  }

  if (!existing) return res.status(404).json({ ok: false, error: "Quote not found." });
  if (existing.converted_to_order_id) {
    return res.status(409).json({ ok: false, error: "This quote has already been accepted and converted to an order." });
  }
  if (existing.status === "rejected") {
    return res.status(409).json({ ok: false, error: "This quote was previously declined. Please request a new one." });
  }
  if (existing.status === "expired") {
    return res.status(409).json({ ok: false, error: "This quote has expired. Please request a new one." });
  }
  if (existing.valid_until) {
    const validUntil = new Date(existing.valid_until);
    if (!Number.isNaN(validUntil.getTime()) && validUntil < new Date()) {
      // Defensive flip: stamp the quote as expired so the next call
      // returns the same answer without re-checking the date.
      await (supabase as any)
        .from("quotes")
        .update({ status: "expired" })
        .eq("id", existing.id);
      return res.status(409).json({ ok: false, error: "This quote has expired. Please request a new one." });
    }
  }

  // Resolve quote + stamp acceptance.
  // Wave 17 audit: previously the existence check + the UPDATE were
  // two separate round-trips. Two simultaneous client clicks (or a
  // double-tap on a slow connection) both passed the existence
  // check, both ran the UPDATE, both fired convertQuoteToOrder --
  // duplicate orders + duplicate deposit invoices + duplicate
  // kitchen prep tasks landed for the same quote. Make the UPDATE
  // atomic by gating on status (only matches a non-accepted row);
  // the second call lands an empty .single() which we treat as
  // "someone else already accepted, return 409".
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await (supabase as any)
    .from("quotes")
    .update({
      accepted_at: nowIso,
      status: "accepted",
      // TIGHTEN I.110: clear any stale lost_reason / rejected_at
      // markers left by a previous (now-reversed) cancellation cycle.
      // Belt-and-braces - the .in() filter blocks rejected→accepted
      // re-transitions via this route, but if a future code path
      // enables that flow the markers won't drift.
      lost_reason: null,
      rejected_at: null,
    })
    .eq("public_token", token)
    .is("deleted_at", null)
    // Block re-accepts of already-accepted / rejected / expired
    // quotes. Only draft + sent are still in-play.
    .in("status", ["draft", "sent"])
    // Wave 12 follow-up: `currency` lives on companies, not quotes --
    // selecting it from quotes returns "column quotes.currency does not
    // exist" and 500s the accept flow. Pull currency from companies
    // below where we already fetch tenant context for the email.
    .select("id, company_id, user_id, client_id, client_name, client_email, total, event_date, guest_count, quote_name, quote_number")
    .maybeSingle();

  // Wave 17 audit: don't leak raw Postgres errors to the public client.
  // Log the real cause server-side, surface a friendly message.
  if (error) {
    console.error("[public/quotes/accept] update failed", { token, error });
    return res.status(500).json({ ok: false, error: "Couldn't accept this quote right now. Please try again or contact the caterer." });
  }
  if (!updated) {
    // No row matched - either the token is wrong (404) OR another
    // request just accepted this one (race - treat as 409 idempotent).
    const { data: existsCheck, error: existsCheckErr } = await (supabase as any)
      .from("quotes")
      .select("id, status")
      .eq("public_token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (existsCheckErr) {
      console.error("[public/quotes/[token]/accept] quotes fetch failed:", existsCheckErr);
    }
    if (existsCheck?.status === "accepted") {
      return res.status(200).json({ ok: true, alreadyAccepted: true, quoteId: existsCheck.id });
    }
    return res.status(404).json({ ok: false, error: "Quote not found." });
  }

  // Audit (May 2026, Wave 3): public acceptance now fires the same
  // convert-to-order cascade the admin "Mark accepted" path uses --
  // creates the order via convert_quote_to_order RPC, then
  // postOrderCreationCascade for invoice + email + kitchen prep +
  // equipment bookings + line items. Previously the public path only
  // stamped accepted_at and the catering team had to manually convert
  // every accepted quote into an order, with the on-page timeline
  // ("Step 2: Deposit invoice") being a lie until they did.
  try {
    const { quoteService } = await import("@/services/quoteService");
    await (quoteService as any).convertQuoteToOrder(updated.id);
  } catch (err) {
    console.warn("[public/quotes/accept] convert-to-order cascade failed (non-blocking):", err);
  }

  // Audit row - separate table so the quote row stays clean and we
  // can keep multiple acceptance attempts (rare but the data exists).
  try {
    await (supabase as any).from("quote_acceptances").insert([{
      company_id: updated.company_id,
      quote_id: updated.id,
      acceptor_name: acceptorName,
      ip_hash: ipHash,
      user_agent: userAgent,
      accepted_at: nowIso,
    }]);
  } catch (err) {
    console.warn("[public/quotes/accept] audit insert failed", err);
  }

  // Wave 23: cross-cutting audit_logs row mirroring the quote_acceptances
  // domain insert above. quote_acceptances is the rich record (acceptor
  // name, IP hash, UA); audit_logs is the cross-entity feed the
  // platform-wide audit views read from.
  void (async () => {
    try {
      await (supabase as any).from("audit_logs").insert({
        company_id: updated.company_id,
        user_id: null, // public token-bearer flow - no auth user
        action: "quote_accepted",
        entity_type: "quote",
        entity_id: updated.id,
        details: {
          quote_number: (updated as any).quote_number,
          client_email: updated.client_email,
          acceptor_name: acceptorName,
        },
      });
    } catch (auditErr) {
      console.warn("[public/quotes/accept] audit_logs insert failed:", auditErr);
    }
  })();

  // Fire notifications fully async so the client gets a fast response.
  // Each channel is best-effort, wrapped in its own try/catch.
  void notifyAdminOfAcceptance(supabase, updated, acceptorName);
  void notifyClientOfAcceptance(supabase, updated, acceptorName);

  return res.status(200).json({ ok: true });
}

/**
 * Client-facing confirmation: email + in-app notification mirroring
 * the timeline copy on /q/[token].tsx (confirmation email -> deposit
 * invoice -> event day) so the page and the email tell the same
 * story. Subject text is intentionally generic for now - Agent C
 * personalises subject lines centrally. Best-effort, wrapped per
 * channel so a failed send never rolls back the acceptance.
 */
async function notifyClientOfAcceptance(supabase: any, quote: any, acceptorName: string) {
  // Resolve the catering company's display name - the email signs
  // off as "{tenant_name} will send your deposit invoice shortly"
  // rather than "your catering company".
  let tenantName = "Your catering team";
  try {
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", quote.company_id)
      .maybeSingle();
    if (company?.company_name) tenantName = company.company_name;
  } catch (err) {
    console.warn("[public/quotes/accept] tenant lookup failed", err);
  }

  const eventName = quote.quote_name || "your event";
  const firstName = String(acceptorName || quote.client_name || "")
    .trim()
    .split(" ")[0] || "there";
  const eventLabel = quote.event_date
    ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : "your event date";

  // 1. In-app notification to the client. Resolve clients.id ->
  // auth.users.id; if the client isn't linked yet (portal-token only)
  // we skip silently rather than insert a row no auth user can read.
  try {
    const clientAuthUid = await resolveClientUserId(supabase, quote.client_id || null);
    if (clientAuthUid) {
      await supabase.from("notifications").insert([{
        company_id: quote.company_id,
        user_id: clientAuthUid,
        recipient_id: clientAuthUid,
        notification_type: "quote_accepted_client",
        title: "You're booked in",
        message: `Thanks for accepting your ${eventName} quote. ${tenantName} will send your deposit invoice shortly.`,
        priority: "normal",
        link: `/client-portal/quotes/${quote.id}`,
        related_entity_type: "quote",
        related_entity_id: quote.id,
      }]);
    }
  } catch (err) {
    console.warn("[public/quotes/accept] client in-app notif failed", err);
  }

  // 2. Confirmation email. Mirrors the on-page timeline copy so the
  // story stays consistent across channels. Subject + body resolve
  // through the centralised resolver - tenant override beats global
  // default beats the inline fallback. Service-role client passed so
  // the resolver can read the global-default row even though there is
  // no authenticated user on this public endpoint.
  try {
    if (quote.client_email) {
      const { emailService } = await import("@/services/emailService");
      const { resolveEmailTemplate } = await import("@/services/email/templateResolver");

      const fallbackBody =
        `Hi {{first_name}},\n\n` +
        `Thanks for accepting your {{event_name}} quote - you're booked in.\n\n` +
        `Here's what happens from here:\n\n` +
        `1. Confirmation email: this email is your record. A copy of the quote is on your client portal.\n` +
        `2. Deposit invoice: {{tenant_name}} will send the deposit invoice shortly to lock in your event date.\n` +
        `3. Event day{{event_day_suffix}}: we'll be in touch the week before with final headcount and any last tweaks.\n\n` +
        `If anything has changed on your side, just reply to this email and we'll sort it.\n\n` +
        `Looking forward to it,\n{{tenant_name}}`;

      const resolved = await resolveEmailTemplate({
        companyId: quote.company_id,
        templateType: "quote_accepted_client",
        variables: {
          client_name: quote.client_name,
          first_name: firstName,
          tenant_name: tenantName,
          event_name: eventName,
          event_date: eventLabel,
          event_day_suffix: quote.event_date ? ` (${eventLabel})` : "",
        },
        fallback: {
          subject: `Quote accepted - thanks ${firstName}`,
          bodyHtml: fallbackBody,
        },
        client: supabase,
      });

      await (emailService as any).sendEmail({
        companyId: quote.company_id,
        to: quote.client_email,
        subject: resolved.subject,
        body: resolved.bodyHtml,
        _client: supabase,
      });
    }
  } catch (err) {
    console.warn("[public/quotes/accept] client confirmation email failed", err);
  }
}

async function notifyAdminOfAcceptance(supabase: any, quote: any, acceptorName: string) {
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, phone_number, company_name")
    .eq("id", quote.user_id)
    .maybeSingle();
  if (profileErr) {
    console.error("[public/quotes/[token]/accept] profiles fetch failed:", profileErr);
  }

  // Currency lives on companies, not quotes. Resolve from the
  // tenant's company row with a ZAR fallback for legacy rows.
  let currencyCode = "ZAR";
  try {
    const { data: companyRow, error: companyRowErr } = await supabase
      .from("companies")
      .select("currency")
      .eq("id", quote.company_id)
      .maybeSingle();
    if (companyRowErr) {
      console.error("[public/quotes/[token]/accept] companies fetch failed:", companyRowErr);
    }
    if ((companyRow as any)?.currency) currencyCode = (companyRow as any).currency;
  } catch { /* fall back to ZAR */ }
  const totalLabel = `${currencyCode} ${Number(quote.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
  const eventLabel = quote.event_date
    ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : "TBD";
  const acceptorLabel = acceptorName || quote.client_name || "the client";
  const companyName = profile?.company_name || profile?.full_name || "Your catering company";

  // 1. In-app notification (urgent)
  try {
    await supabase.from("notifications").insert([{
      company_id: quote.company_id,
      user_id: quote.user_id,
      recipient_id: quote.user_id,
      notification_type: "quote_accepted",
      title: "✅ Quote accepted!",
      message: `${acceptorLabel} accepted the quote for ${quote.client_name || "this booking"} - ${totalLabel}, event ${eventLabel}.`,
      priority: "urgent",
      link: `/admin/quotes/${quote.id}`,
    }]);
  } catch (err) {
    console.warn("[public/quotes/accept] in-app notif failed", err);
  }

  // 2. Email to the owner. Wave 50: routes through resolveEmailTemplate
  // so a tenant editing quote_accepted_admin_notify in
  // /admin/messaging-templates drives this send.
  try {
    if (profile?.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_VERCEL_URL || "";
      const origin = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
      const { emailService } = await import("@/services/emailService");
      const { resolveEmailTemplate } = await import("@/services/email/templateResolver");

      const quoteLink = `${origin}/admin/quotes/${quote.id}`;
      const fallbackSubject = `Quote accepted - ${quote.client_name || "client"}`;
      const fallbackBody =
        `{{acceptor_name}} just accepted the quote for {{client_name}}.\n\n` +
        `Total: {{total}}\nEvent date: {{event_date}}\nGuests: {{guest_count}}\n\n` +
        `Open the quote to convert it into an order:\n{{quote_link}}`;

      const resolved = await resolveEmailTemplate({
        companyId: quote.company_id,
        templateType: "quote_accepted_admin_notify",
        variables: {
          client_name: String(quote.client_name || "the client"),
          acceptor_name: String(acceptorLabel),
          total: String(totalLabel),
          event_date: String(eventLabel),
          guest_count: String(quote.guest_count ?? "TBD"),
          quote_link: quoteLink,
          company_name: String(companyName),
          // Legacy keys retained for tenants whose existing override
          // referenced the camelCase bag this email used to ship.
          clientName: String(quote.client_name || "the client"),
          companyName: String(companyName),
          totalAmount: String(totalLabel),
        },
        fallback: { subject: fallbackSubject, bodyHtml: fallbackBody },
        client: supabase,
      });

      // Wave 17 audit: pass the service-role client so getEmailConfig
      // reads email_provider_settings under the right auth context
      // (this is a public unauth route).
      await (emailService as any).sendEmail({
        companyId: quote.company_id,
        to: profile.email,
        subject: resolved.subject,
        body: resolved.bodyHtml,
        _client: supabase,
      });
    }
  } catch (err) {
    console.warn("[public/quotes/accept] owner email failed", err);
  }

  // 3. WhatsApp to the owner (best-effort, skipped silently when no phone)
  try {
    const adminPhone = profile?.phone || profile?.phone_number;
    if (adminPhone) {
      const { whatsappIntegrationService } = await import("@/services/whatsappIntegrationService");
      await (whatsappIntegrationService as any).sendWhatsAppMessage({
        to: adminPhone,
        type: "text",
        text: {
          body:
            `✅ Quote accepted!\n\n` +
            `Client: ${quote.client_name || acceptorLabel}\n` +
            `Total: ${totalLabel}\n` +
            `Event: ${eventLabel}\n\n` +
            `Convert to order in the admin portal.`,
        },
      });
    }
  } catch (err) {
    console.warn("[public/quotes/accept] owner whatsapp failed", err);
  }
}

export default withApiLogging(handler);
