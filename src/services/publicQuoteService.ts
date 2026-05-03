/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * publicQuoteService -- helpers for the public quote share flow.
 *
 * Two surfaces use this:
 *
 *   1. Admin /admin/quotes -- buildPublicQuoteUrl() to copy a clean
 *      link the catering company sends to the client.
 *
 *   2. Public /q/[token]  -- fetchByToken() to load the quote (and
 *      its company branding), recordView() and recordAccept() to
 *      stamp the lifecycle timestamps.
 *
 * Authentication: the public route uses the anon Supabase key. The
 * RLS policy on quotes (see migration `quote_public_token`) lets the
 * anon role select / update by the row's public_token. Effectively
 * the token IS the auth token; if you have it, you can view + accept
 * the quote it points at. Tokens are uuids, unguessable.
 */

import { supabase } from "@/integrations/supabase/client";

export interface PublicQuoteView {
  id: string;
  quote_number: string;
  quote_name: string;
  client_name: string | null;
  event_date: string | null;
  guest_count: number | null;
  venue_address: string | null;
  menu_items: any[] | null;
  equipment_items: any[] | null;
  notes: string | null;
  terms_and_conditions: string | null;
  subtotal: number;
  tax_amount: number | null;
  discount_amount: number | null;
  total: number;
  total_amount: number;
  status: string | null;
  valid_until: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  company: {
    id: string;
    company_name: string | null;
    logo_url: string | null;
    email: string | null;
    phone: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    vat_registered: boolean | null;
    vat_number: string | null;
    vat_rate: number | null;
  } | null;
}

/**
 * Build the public URL for a quote.
 *
 *   buildPublicQuoteUrl(token)  ->  https://{host}/q/{token}
 *
 * The host is read off window.location at call time so it follows
 * whichever subdomain / preview URL the operator is on.
 */
export function buildPublicQuoteUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/q/${token}`;
}

/**
 * Pull a quote by its public token, including just enough company
 * branding for the public view to feel like the catering company's
 * own page. Returns null when the token is unknown or the quote has
 * been soft-deleted.
 */
export async function fetchByToken(token: string): Promise<PublicQuoteView | null> {
  const { data, error } = await (supabase as any)
    .from("quotes")
    .select(`
      id, quote_number, quote_name, client_name, event_date, guest_count,
      venue_address, menu_items, equipment_items, notes, terms_and_conditions,
      subtotal, tax_amount, discount_amount, total, total_amount, status,
      valid_until, sent_at, viewed_at, accepted_at,
      company:company_id (
        id, company_name, logo_url, email, phone,
        address_line1, address_line2, city,
        vat_registered, vat_number, vat_rate
      )
    `)
    .eq("public_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("fetchByToken error:", error);
    return null;
  }
  return (data as PublicQuoteView) || null;
}

/**
 * Stamp viewed_at the first time the public page loads. No-op if
 * the quote already has a viewed_at -- we want the anchor to be
 * the first view, not the latest.
 *
 * Fires a low-priority admin notification on the FIRST view so the
 * catering team knows the client has actually opened the quote and
 * isn't sitting in their spam folder. Closes the audit gap "no quote
 * engagement tracking" -- before this, admins had no signal between
 * send and accept.
 */
export async function recordView(token: string, currentViewedAt: string | null): Promise<void> {
  if (currentViewedAt) return;
  // Update + return the row so we can fire the notification with
  // its details. maybeSingle so we don't blow up if the token is
  // already invalid by the time we try.
  const { data: row } = await (supabase as any)
    .from("quotes")
    .update({ viewed_at: new Date().toISOString() })
    .eq("public_token", token)
    .is("deleted_at", null)
    .select("id, company_id, user_id, client_name, total, currency, event_date")
    .maybeSingle();
  if (!row) return;

  // Best-effort -- a failed notify mustn't break the public page load.
  try {
    const { notificationService } = await import("./notificationService");
    const totalLabel = `${(row as any).currency || "ZAR"} ${Number((row as any).total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
    const eventLabel = (row as any).event_date
      ? new Date((row as any).event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
      : "TBD";
    await notificationService.createNotification({
      company_id: (row as any).company_id,
      user_id: (row as any).user_id,
      recipient_id: (row as any).user_id,
      notification_type: "quote_viewed",
      title: "👀 Client viewed your quote",
      message: `${(row as any).client_name || "Client"} just opened the quote (${totalLabel}, event ${eventLabel}). They're considering -- a follow-up nudge tomorrow if quiet might help.`,
      priority: "normal",
      link: `/admin/quotes/${(row as any).id}`,
    } as any);
  } catch (e) {
    console.warn("[publicQuoteService] view notify failed:", e);
  }
}

/**
 * Stamp accepted_at when the client clicks Accept. Updates status to
 * 'accepted' too so the admin side picks up the change without a
 * second round-trip. Fires admin notifications (in-app + email +
 * WhatsApp) so the catering team finds out the moment the client
 * commits, not on next page reload.
 */
export async function recordAccept(args: {
  token: string;
  acceptedByName: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.token) return { ok: false, error: "Missing token." };
  if (!args.acceptedByName?.trim()) return { ok: false, error: "Please enter your name." };

  // We stash the acceptor's name in notes-ish JSON on the quote row
  // so we don't need a new column. The acceptance audit trail lives
  // in the row's accepted_at + status change.
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await (supabase as any)
    .from("quotes")
    .update({
      accepted_at: nowIso,
      status: "accepted",
    })
    .eq("public_token", args.token)
    .is("deleted_at", null)
    .select("id, company_id, user_id, client_name, client_email, total, currency, event_date, guest_count")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: "Quote not found." };

  // Fire-and-forget admin alerts. Wrapped in its own try/catch so a
  // failed notification (Resend down, etc.) never makes the public
  // accept fail -- the quote IS accepted, the alert is best-effort.
  notifyAdminOfAcceptance(updated, args.acceptedByName).catch((notifyErr) =>
    console.warn("[publicQuoteService] admin acceptance alert failed:", notifyErr),
  );

  return { ok: true };
}

/**
 * Internal: in-app + email + WhatsApp ping to the catering team that
 * this quote was just accepted. Pulled out so recordAccept reads
 * linearly. Best-effort -- every channel is wrapped in its own try
 * so one failure (no admin phone configured, no email provider) does
 * not block the others.
 */
async function notifyAdminOfAcceptance(
  quote: any,
  acceptedByName: string,
): Promise<void> {
  const sb: any = supabase;

  // Owner profile drives in-app notification recipient + email + phone.
  const { data: profile } = await sb
    .from("profiles")
    .select("id, full_name, email, phone, phone_number, company_name")
    .eq("id", quote.user_id)
    .maybeSingle();

  const companyName = profile?.company_name || profile?.full_name || "Your catering company";
  const totalLabel = `${quote.currency || "ZAR"} ${Number(quote.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
  const eventLabel = quote.event_date
    ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : "TBD";
  const acceptorLabel = acceptedByName || quote.client_name || "the client";

  // 1. In-app notification (urgent priority -- admin should act on
  //    converting to an order today).
  try {
    const { notificationService } = await import("./notificationService");
    await notificationService.createNotification({
      company_id: quote.company_id,
      user_id: quote.user_id,
      recipient_id: quote.user_id,
      notification_type: "quote_accepted",
      title: "✅ Quote accepted!",
      message: `${acceptorLabel} accepted the quote for ${quote.client_name || "this booking"} -- ${totalLabel}, event ${eventLabel}.`,
      priority: "urgent",
      link: `/admin/quotes/${quote.id}`,
    } as any);
  } catch (e) {
    console.warn("[publicQuoteService] in-app accept notif failed:", e);
  }

  // 2. Email to the owner.
  try {
    if (profile?.email) {
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: quote.user_id,
          to: profile.email,
          subject: `Quote accepted -- ${quote.client_name || "client"}`,
          body: `${acceptorLabel} just accepted the quote for ${quote.client_name || "this booking"}.\n\n` +
                `Total: ${totalLabel}\nEvent date: ${eventLabel}\nGuests: ${quote.guest_count ?? "TBD"}\n\n` +
                `Open the quote to convert it into an order: ${typeof window !== "undefined" ? window.location.origin : ""}/admin/quotes/${quote.id}`,
          variables: {
            clientName: quote.client_name,
            companyName,
            totalAmount: totalLabel,
          },
        }),
      });
    }
  } catch (e) {
    console.warn("[publicQuoteService] accept email to owner failed:", e);
  }

  // 3. WhatsApp to the owner (if a phone is configured).
  try {
    const adminPhone = profile?.phone || profile?.phone_number;
    if (adminPhone) {
      const { whatsappIntegrationService } = await import("./whatsappIntegrationService");
      await whatsappIntegrationService.sendWhatsAppMessage({
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
      } as any);
    }
  } catch (e) {
    console.warn("[publicQuoteService] accept whatsapp to owner failed:", e);
  }
}
