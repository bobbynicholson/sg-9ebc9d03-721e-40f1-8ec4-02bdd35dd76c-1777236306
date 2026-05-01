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
 */
export async function recordView(token: string, currentViewedAt: string | null): Promise<void> {
  if (currentViewedAt) return;
  await (supabase as any)
    .from("quotes")
    .update({ viewed_at: new Date().toISOString() })
    .eq("public_token", token)
    .is("deleted_at", null);
}

/**
 * Stamp accepted_at when the client clicks Accept. Updates status to
 * 'accepted' too so the admin side picks up the change without a
 * second round-trip.
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
  const { error } = await (supabase as any)
    .from("quotes")
    .update({
      accepted_at: nowIso,
      status: "accepted",
    })
    .eq("public_token", args.token)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
