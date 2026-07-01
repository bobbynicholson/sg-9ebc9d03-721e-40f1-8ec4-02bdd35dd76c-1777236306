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
import { getEventCapacityForDate, publicCapacityMessage } from "@/lib/eventCapacity";


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

  // Audit (May 2026, Wave 3): the endpoint previously stamped
  // accepted_at + status='accepted' on ANY quote matching the token,
  // even if it was already rejected, expired or past valid_until.
  // A client (or anyone with the token) could re-accept stale pricing
  // weeks later. Gate the acceptance on a fresh status check first.
  const { data: existing, error: existingErr } = await (supabase as any)
    .from("quotes")
    .select("id, company_id, status, valid_until, converted_to_order_id, event_date, guest_count")
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
  if (existing.status === "accepted") {
    // Already accepted (not yet converted) - idempotent success. Return
    // here BEFORE the rate-limit so a client re-clicking, or re-opening
    // the link, never burns budget on a no-op re-accept.
    return res.status(200).json({ ok: true, alreadyAccepted: true, quoteId: existing.id });
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

  if (existing.event_date && existing.company_id) {
    try {
      const capacity = await getEventCapacityForDate(supabase, {
        companyId: existing.company_id,
        eventDate: existing.event_date,
        includeOpenQuotes: false,
        excludeQuoteId: existing.id,
        candidateEventCount: 1,
        candidateGuestCount: existing.guest_count,
      });
      if (capacity.blocksPublicAcceptance) {
        return res.status(409).json({
          ok: false,
          code: "event_capacity_full",
          error: publicCapacityMessage(),
        });
      }
    } catch (capacityErr) {
      console.error("[public/quotes/[token]/accept] capacity check failed:", capacityErr);
      return res.status(500).json({
        ok: false,
        error: "Couldn't confirm event availability right now. Please try again or contact the caterer.",
      });
    }
  }

  // Rate limit - applied ONLY to genuine accept attempts on a still-live
  // (draft / sent) quote. Deliberately placed AFTER the status pre-check:
  // the limiter used to be the first thing the handler did, so every
  // idempotent re-accept, already-converted / rejected / expired hit and
  // every transient-failure retry consumed the budget. With a tight cap
  // that locked the genuine acceptor out with "Too many attempts" the
  // moment they tried twice. Now only a real draft/sent->accepted attempt
  // counts; 30/hr/IP/token still blocks a script while leaving humans
  // ample headroom to retry.
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 30,
    bucket: "hour",
  });
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: "Too many attempts, try again later." });
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
    .select("id, company_id, user_id, client_id, client_name, client_email, total, event_date, guest_count, quote_name, quote_number, public_token")
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
  let convertedOrderId: string | null = null;
  try {
    const { quoteService } = await import("@/services/quoteService");
    const convertResult = await (quoteService as any).convertQuoteToOrder(updated.id, { _client: supabase });
    convertedOrderId = (convertResult as any)?.order?.id ?? null;
    // convertQuoteToOrder reports refusals (no_guest_count,
    // no_client_email, ...) via the result object without throwing.
    // Surface them in the logs - otherwise the only symptom is the
    // confirmation email silently falling back to the quote URL.
    if (!convertedOrderId && (convertResult as any)?.error) {
      console.warn(
        "[public/quotes/accept] convert-to-order refused (non-blocking):",
        (convertResult as any).error_code || (convertResult as any).error,
      );
    }
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

  // Await notifications before returning so Vercel doesn't cut them off.
  // Each function is internally try/caught - failures warn but never throw.
  await Promise.all([
    notifyAdminOfAcceptance(supabase, updated, acceptorName),
    notifyClientOfAcceptance(supabase, updated),
  ]);

  return res.status(200).json({ ok: true });
}

/**
 * Client-facing confirmation: in-app notification only. The deposit
 * invoice email generated by the conversion cascade is the single
 * client-facing acceptance email, so we do not send a separate
 * quote_accepted_client email here.
 */
async function notifyClientOfAcceptance(supabase: any, quote: any) {
  // Resolve the catering company's display name for the in-app copy.
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

  // Quote builder drafts default to "Untitled" - "Thanks for accepting
  // the quote for Untitled" reads broken, so treat it like no name.
  const rawQuoteName = String(quote.quote_name || "").trim();
  const eventName = rawQuoteName && rawQuoteName.toLowerCase() !== "untitled"
    ? rawQuoteName
    : "your event";

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
        message: `Thanks for accepting your ${eventName} quote. ${tenantName} sent your deposit invoice to lock in your event date.`,
        priority: "normal",
        link: `/client-portal/quotes/${quote.id}`,
        related_entity_type: "quote",
        related_entity_id: quote.id,
      }]);
    }
  } catch (err) {
    console.warn("[public/quotes/accept] client in-app notif failed", err);
  }
}

async function notifyAdminOfAcceptance(supabase: any, quote: any, acceptorName: string) {
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

  // 1. In-app notification (urgent)
  try {
    await supabase.from("notifications").insert([{
      company_id: quote.company_id,
      user_id: quote.user_id,
      recipient_id: quote.user_id,
      notification_type: "quote_accepted",
      title: "Quote accepted",
      message: `${acceptorLabel} accepted the quote for ${quote.client_name || "this booking"} - ${totalLabel}, event ${eventLabel}.`,
      priority: "urgent",
      link: `/admin/quotes/${quote.id}`,
    }]);
  } catch (err) {
    console.warn("[public/quotes/accept] in-app notif failed", err);
  }

  // The deposit invoice email is the single email sent when a quote is
  // accepted. Keep admin awareness in-app only so the owner inbox does
  // not receive a separate quote-accepted email/WhatsApp on top of the
  // client-facing invoice email.
}

export default withApiLogging(handler);
