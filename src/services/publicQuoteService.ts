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
 * SELECT only -- the token IS the secret, the anon SELECT policy on
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
    /** Brand colours for the public quote / invoice templates. */
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
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
export function buildPublicQuoteUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/q/${token}`;
}

/**
 * Pull a quote by its public token, including just enough company
 * branding (incl. brand colours + logo) for the public view to feel
 * like the catering company's own page. Returns null when the token
 * is unknown or the quote has been soft-deleted.
 */
export async function fetchByToken(token: string): Promise<PublicQuoteView | null> {
  const { data, error } = await (supabase as any)
    .from("quotes")
    .select(`
      id, quote_number, quote_name, client_name, event_date, event_time, setup_time, guest_count,
      venue_address, menu_items, equipment_items, notes, terms_and_conditions,
      subtotal, tax_amount, discount_amount, total, total_amount, status,
      delivery_fee, delivery_distance_km, delivery_rate_per_km,
      valid_until, sent_at, viewed_at, accepted_at,
      company:company_id (
        id, company_name, legal_name, logo_url, email, phone, website,
        address_line1, address_line2, city,
        vat_registered, vat_number, vat_rate,
        registration_number, tax_number,
        primary_color, secondary_color, accent_color,
        currency
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
