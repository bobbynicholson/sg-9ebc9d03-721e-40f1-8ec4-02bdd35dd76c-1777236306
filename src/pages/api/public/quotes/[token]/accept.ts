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

/**
 * POST /api/public/quotes/[token]/accept
 *
 * Public, unauthenticated. Records the acceptance:
 *   1. Stamps quotes.accepted_at + status = 'accepted'
 *   2. Inserts a quote_acceptances audit row (acceptor name, IP hash, UA)
 *   3. Fires admin notifications (in-app + email + WhatsApp best-effort)
 *
 * Service role only -- the anon client cannot insert into notifications
 * (tenant_create_notifications RLS blocks anon) or quote_acceptances
 * (no anon policy), and the quotes UPDATE policy was tightened so anon
 * can no longer flip accepted_at directly.
 */

const MAX_NAME = 200;

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } },
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

  // Resolve quote + stamp acceptance.
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await (supabase as any)
    .from("quotes")
    .update({ accepted_at: nowIso, status: "accepted" })
    .eq("public_token", token)
    .is("deleted_at", null)
    .select("id, company_id, user_id, client_id, client_name, client_email, total, currency, event_date, guest_count, quote_name")
    .maybeSingle();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!updated) return res.status(404).json({ ok: false, error: "Quote not found." });

  // Audit row -- separate table so the quote row stays clean and we
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
 * story. Subject text is intentionally generic for now -- Agent C
 * personalises subject lines centrally. Best-effort, wrapped per
 * channel so a failed send never rolls back the acceptance.
 */
async function notifyClientOfAcceptance(supabase: any, quote: any, acceptorName: string) {
  // Resolve the catering company's display name -- the email signs
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
  // through the centralised resolver -- tenant override beats global
  // default beats the inline fallback. Service-role client passed so
  // the resolver can read the global-default row even though there is
  // no authenticated user on this public endpoint.
  try {
    if (quote.client_email) {
      const { emailService } = await import("@/services/emailService");
      const { resolveEmailTemplate } = await import("@/services/email/templateResolver");

      const fallbackBody =
        `Hi {{first_name}},\n\n` +
        `Thanks for accepting your {{event_name}} quote -- you're booked in.\n\n` +
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
          subject: `Quote accepted -- thanks ${firstName}`,
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, phone_number, company_name")
    .eq("id", quote.user_id)
    .maybeSingle();

  const totalLabel = `${quote.currency || "ZAR"} ${Number(quote.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
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
      message: `${acceptorLabel} accepted the quote for ${quote.client_name || "this booking"} -- ${totalLabel}, event ${eventLabel}.`,
      priority: "urgent",
      link: `/admin/quotes/${quote.id}`,
    }]);
  } catch (err) {
    console.warn("[public/quotes/accept] in-app notif failed", err);
  }

  // 2. Email to the owner
  try {
    if (profile?.email) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_VERCEL_URL || "";
      const origin = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
      const { emailService } = await import("@/services/emailService");
      await (emailService as any).sendEmail({
        companyId: quote.company_id,
        to: profile.email,
        subject: `Quote accepted -- ${quote.client_name || "client"}`,
        body: `${acceptorLabel} just accepted the quote for ${quote.client_name || "this booking"}.\n\n` +
              `Total: ${totalLabel}\nEvent date: ${eventLabel}\nGuests: ${quote.guest_count ?? "TBD"}\n\n` +
              `Open the quote to convert it into an order: ${origin}/admin/quotes/${quote.id}`,
        variables: {
          clientName: quote.client_name,
          companyName,
          totalAmount: totalLabel,
        },
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
