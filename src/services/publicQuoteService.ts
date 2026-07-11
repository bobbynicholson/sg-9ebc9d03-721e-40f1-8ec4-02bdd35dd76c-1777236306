/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * publicQuoteService - helpers for the public quote share flow.
 *
 * Two surfaces use this:
 *
 *   1. Admin /admin/quotes - buildPublicQuoteUrl() to copy a clean
 *      link the catering company sends to the client.
 *
 *   2. Public /q/[token]  - fetchByToken() to load the quote (and
 *      its company branding), then recordView() / recordAccept() /
 *      submitChangeRequest() which now POST to server-side API
 *      routes (service-role) instead of writing through the anon
 *      client. Anon writes to quotes / notifications were either
 *      blocked by RLS (notifications) or dangerously open (quotes
 *      had USING(deleted_at IS NULL) which let anon update ANY
 *      quote). The API routes resolve the token server-side and
 *      handle every write under service role.
 *
 * Authentication: the public route uses the anon Supabase key for
 * SELECT only - the token IS the secret, the anon SELECT policy on
 * quotes / invoices is "non-deleted only", and the app always queries
 * .eq(public_token, token).
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
  /**
   * Percentage of total_amount the client needs to pay to confirm.
   * Null when the tenant hasn't configured a deposit. Phase 3e client
   * sweep surfaces this on the accept button so the client knows the
   * deposit size before tapping Accept.
   */
  deposit_percentage: number | null;
  status: string | null;
  valid_until: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  /**
   * TIGHTEN I.113 (2026-06-02): the converted order's id. When this
   * is set, the same /q/{token} URL the client clicked from their
   * email should bridge to /c/order/{converted_to_order_id}?t=... -
   * the order page shows the post-acceptance state (current status,
   * invoice, tracking timeline) which the frozen quote celebration
   * card never could.
   */
  converted_to_order_id: string | null;
  /**
   * True when the client has an unaddressed change request on this quote.
   * The public view hides Accept / Decline while this is set - the quote
   * is awaiting the caterer's re-priced version. Cleared when the operator
   * Save & Sends (which marks the request addressed).
   */
  pending_change_request?: boolean;
  event_capacity?: {
    status: "available" | "at_capacity" | "over_capacity";
    accepting_blocked: boolean;
    message: string | null;
  } | null;
  company: {
    id: string;
    /** Feeds the public /terms/[company] link (id is the fallback). */
    slug?: string | null;
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
    /** Brand colours for the public quote / invoice templates. */
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
    brand_font_body?: string | null;
    brand_font_display?: string | null;
    /** Phase 5 #10: ISO 4217 code. Drives the currency symbol +
     *  formatting on the public quote view. NULL falls back to ZAR. */
    currency: string | null;
  } | null;
}

/**
 * Build the public URL for a quote.
 *
 *   buildPublicQuoteUrl(token)  ->  https://{host}/q/{token}
 */
/**
 * TIGHTEN I.115 (2026-06-02): now slug-aware. The bare /q/{token} path
 * doesn't serve cleanly at the production apex domain; the slug-
 * prefixed `/{slug}/q/{token}` path routes through Vercel's tenant
 * rewrite chain and produces a branded URL the client sees. Existing
 * callers without a slug still get the back-compat path.
 */
export function buildPublicQuoteUrl(
  token: string | null | undefined,
  slug?: string | null,
): string | null {
  if (!token) return null;
  if (typeof window === "undefined") return null;
  const slugSeg = slug ? `/${String(slug).trim().replace(/^\/+|\/+$/g, "")}` : "";
  return `${window.location.origin}${slugSeg}/q/${token}`;
}

/**
 * Pull a quote by its public token, including just enough company
 * branding (incl. brand colours + logo) for the public view to feel
 * like the catering company's own page. Returns null when the token
 * is unknown or the quote has been soft-deleted.
 */
/**
 * TIGHTEN I.116 (2026-06-02): route through the service-role endpoint
 * at /api/public/quotes/[token]/get. The direct supabase-js anon
 * query that used to work here relied on an open RLS policy that was
 * dropped in 20260521090000 - which left this function returning null
 * for everyone in production. The "Quote not found" card on /q/[token]
 * was the symptom.
 */
export async function fetchByToken(token: string): Promise<PublicQuoteView | null> {
  if (!token) return null;
  try {
    const res = await fetch(`/api/public/quotes/${token}/get`, {
      method: "GET",
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) {
      console.error("fetchByToken HTTP error:", res.status);
      return null;
    }
    const j = await res.json();
    if (!j?.ok || !j.quote) return null;
    return j.quote as PublicQuoteView;
  } catch (e) {
    console.error("fetchByToken threw:", e);
    return null;
  }
}

/**
 * Best-effort POST to the server-side view endpoint. Idempotent on
 * viewed_at, so calling this on every render is fine.
 */
export async function recordView(token: string, currentViewedAt: string | null): Promise<void> {
  if (currentViewedAt) return;
  try {
    await fetch(`/api/public/quotes/${encodeURIComponent(token)}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (err) {
    console.warn("[publicQuoteService] recordView failed", err);
  }
}

/**
 * Server-side acceptance: stamps accepted_at + status on the quote,
 * writes a quote_acceptances audit row, fans out admin notifications.
 * The acceptor's name is required and validated server-side too.
 */
export async function recordAccept(args: {
  token: string;
  acceptedByName: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.token) return { ok: false, error: "Missing token." };
  if (!args.acceptedByName?.trim()) return { ok: false, error: "Please enter your name." };
  try {
    const res = await fetch(`/api/public/quotes/${encodeURIComponent(args.token)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedByName: args.acceptedByName.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || "Could not accept the quote, please try again." };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error" };
  }
}

/**
 * Submit a change request on the public quote. Inserts a
 * quote_change_requests row + notifies the admin. Server enforces
 * rate-limits, message minimum, per-quote lifetime cap.
 */
export async function submitChangeRequest(args: {
  token: string;
  message: string;
  submitterName?: string | null;
  requestedChanges?: {
    event_date?: string | null;
    guest_count?: number | null;
    menu_changes?: string | null;
    venue_address?: string | null;
    logistics_changes?: string | null;
    /** Structured item picks from the in-form editor. null = the client
     *  didn't touch the item editor (leave the quote's lines as-is). */
    menu_items?: Array<{ menu_item_id: string | null; item_name: string; unit_price: number; quantity: number }> | null;
    equipment_items?: Array<{ equipment_id: string | null; name: string; unit_price: number; quantity: number }> | null;
  };
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.token) return { ok: false, error: "Missing token." };
  if (!args.message?.trim()) return { ok: false, error: "Please tell us what to change." };
  try {
    const res = await fetch(`/api/public/quotes/${encodeURIComponent(args.token)}/change-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: args.message.trim(),
        submitterName: args.submitterName || null,
        requestedChanges: args.requestedChanges || {},
        honeypot: "",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || "Could not send your message, please try again." };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error" };
  }
}
