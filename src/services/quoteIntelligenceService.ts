/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Quote intelligence -- powers the client typeahead on /admin/quotes/new.
 *
 * Why three sources, not one:
 *   - 'clients' is the canonical record but lots of catering tenants do
 *     repeat business with someone whose row was never properly created
 *     (lead converted by a third-party form, or the order was raised
 *     directly without a client_id).
 *   - 'leads' captures pre-conversion contacts the owner met but hasn't
 *     quoted yet -- they should still surface so we don't ask Sue Smith
 *     for her email twice.
 *   - 'quotes' / 'orders' are the historical reality. Even if neither
 *     clients nor leads has the row, we can still recall everything we
 *     need from a previous quote.
 *
 * The service merges hits from all four into one ranked list, dedup'd by
 * email (or by name + phone when email is missing). Each result tells
 * the UI where it came from so the badge labelling stays honest.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────

/**
 * What the typeahead surfaces for each match. Designed so the dropdown
 * can render rich rows without a second query.
 */
export interface KnownClientResult {
  /** Stable key the UI uses for the dropdown. Email when we have one, else "name|phone" */
  key: string;
  client_id: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  sources: Array<"client" | "lead" | "quote" | "order">;
  /** When did we last touch this person (latest of all sources) */
  last_seen: string | null;
  /** Friendly hint for the dropdown row -- e.g. "Quoted 3 days ago" */
  last_seen_label: string | null;
  /** Hints from the most recent activity, used for the prefill preview */
  last_event_date: string | null;
  last_guest_count: number | null;
  last_venue_address: string | null;
}

/**
 * Full snapshot returned when the user picks a result. The page uses
 * this to hydrate every field on the form in one go.
 */
export interface ClientSnapshot {
  client_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;

  last_venue_address: string | null;
  last_venue_lat: number | null;
  last_venue_lng: number | null;

  last_event_date: string | null;
  last_event_type: string | null;
  last_guest_count: number | null;

  /** Up to 5 most recent quotes -- powers the "use last quote as template" UI */
  recent_quotes: Array<{
    id: string;
    quote_number: string | null;
    event_date: string | null;
    total_amount: number | null;
    venue_address: string | null;
    menu_items: any;
    equipment_items: any;
    created_at: string | null;
  }>;

  tags: string[];
  notes: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Display the most recent activity in human-readable form */
function relativeLabel(isoOrNull: string | null, prefix: string): string | null {
  if (!isoOrNull) return null;
  const d = new Date(isoOrNull);
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return `${prefix} ${d.toLocaleDateString("en-ZA")}`;
  if (days === 0) return `${prefix} today`;
  if (days === 1) return `${prefix} yesterday`;
  if (days < 14) return `${prefix} ${days} days ago`;
  if (days < 60) return `${prefix} ${Math.floor(days / 7)} weeks ago`;
  return `${prefix} ${d.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}`;
}

/** Build the dedup key. Email is best; fall back to name+phone */
function keyFor(args: { email?: string | null; name?: string | null; phone?: string | null }): string {
  const email = (args.email || "").trim().toLowerCase();
  if (email) return `e:${email}`;
  const name = (args.name || "").trim().toLowerCase();
  const phone = (args.phone || "").replace(/\s+/g, "");
  return `n:${name}|p:${phone}`;
}

// ── Service ──────────────────────────────────────────────────────────────

export const quoteIntelligenceService = {
  /**
   * Search across clients / leads / quotes / orders for matches against
   * the typed term. Returns up to `limit` ranked, deduplicated results.
   *
   * Ranking: canonical clients first, then leads, then historical
   * quotes/orders. Within each tier, most-recent activity wins.
   */
  async searchKnownClients(
    companyId: string,
    term: string,
    limit: number = 8,
  ): Promise<KnownClientResult[]> {
    if (!companyId) return [];
    const t = (term || "").trim();
    // Empty / 1-char term -> return the most recent clients across the
    // four sources so the typeahead can act as a "browse" list when the
    // operator just opens the field. This was a real Callum complaint:
    // an empty search box surfaced nothing, so it looked like there was
    // no way to pick an existing client.
    const browse = t.length < 2;
    const like = browse ? null : `%${t}%`;

    const orClient = browse ? null : `client_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`;
    const orLead   = browse ? null : `contact_name.ilike.${like},company_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`;
    const orQuote  = browse ? null : `client_name.ilike.${like},client_email.ilike.${like}`;
    const orOrder  = browse ? null : `client_name.ilike.${like},client_email.ilike.${like},client_phone.ilike.${like}`;

    // Run the four queries in parallel -- each capped low so we don't
    // pull a giant slug of data through the dropdown.
    const clientsQ = supabase
      .from("clients")
      .select("id, client_name, email, phone, billing_address_line1, tags, notes, updated_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const leadsQ = supabase
      .from("leads")
      .select("id, contact_name, company_name, email, phone, event_type, event_date, guest_count, venue_address, converted_to_client_id, updated_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const quotesQ = supabase
      .from("quotes")
      .select("id, client_id, client_name, client_email, event_date, guest_count, venue_address, total_amount, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const ordersQ = supabase
      .from("orders")
      .select("id, client_id, client_name, client_email, client_phone, event_date, guest_count, venue_address, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    const [clientsRes, leadsRes, quotesRes, ordersRes] = await Promise.all([
      orClient ? clientsQ.or(orClient) : clientsQ,
      orLead   ? leadsQ.or(orLead)     : leadsQ,
      orQuote  ? quotesQ.or(orQuote)   : quotesQ,
      orOrder  ? ordersQ.or(orOrder)   : ordersQ,
    ]);

    const buckets = new Map<string, KnownClientResult>();

    const upsert = (
      partial: Partial<KnownClientResult> & {
        key: string;
        display_name: string;
        source: "client" | "lead" | "quote" | "order";
      },
      sortKey: string | null,
    ) => {
      const existing = buckets.get(partial.key);
      if (existing) {
        if (!existing.sources.includes(partial.source)) existing.sources.push(partial.source);
        // Promote to canonical client_id when a real one shows up
        if (!existing.client_id && partial.client_id) existing.client_id = partial.client_id;
        // Fill missing fields from later sources
        existing.email ||= partial.email ?? null;
        existing.phone ||= partial.phone ?? null;
        existing.last_event_date ||= partial.last_event_date ?? null;
        existing.last_guest_count ||= partial.last_guest_count ?? null;
        existing.last_venue_address ||= partial.last_venue_address ?? null;
        // Keep the freshest last_seen
        if (sortKey && (!existing.last_seen || sortKey > existing.last_seen)) {
          existing.last_seen = sortKey;
        }
        return;
      }
      buckets.set(partial.key, {
        key: partial.key,
        client_id: partial.client_id ?? null,
        display_name: partial.display_name,
        email: partial.email ?? null,
        phone: partial.phone ?? null,
        sources: [partial.source],
        last_seen: sortKey,
        last_seen_label: null, // computed at the end
        last_event_date: partial.last_event_date ?? null,
        last_guest_count: partial.last_guest_count ?? null,
        last_venue_address: partial.last_venue_address ?? null,
      });
    };

    for (const c of clientsRes.data || []) {
      upsert({
        key: keyFor({ email: c.email, name: c.client_name, phone: c.phone }),
        client_id: c.id,
        display_name: c.client_name || c.email || "Client",
        email: c.email,
        phone: c.phone,
        last_venue_address: c.billing_address_line1,
        source: "client",
      }, c.updated_at);
    }
    for (const l of leadsRes.data || []) {
      const display = l.contact_name || l.company_name || l.email || "Lead";
      upsert({
        key: keyFor({ email: l.email, name: display, phone: l.phone }),
        client_id: l.converted_to_client_id ?? null,
        display_name: display,
        email: l.email,
        phone: l.phone,
        last_event_date: l.event_date,
        last_guest_count: l.guest_count,
        last_venue_address: l.venue_address,
        source: "lead",
      }, l.updated_at);
    }
    for (const q of quotesRes.data || []) {
      upsert({
        key: keyFor({ email: q.client_email, name: q.client_name, phone: null }),
        client_id: q.client_id ?? null,
        display_name: q.client_name || q.client_email || "Quote client",
        email: q.client_email,
        last_event_date: q.event_date,
        last_guest_count: q.guest_count,
        last_venue_address: q.venue_address,
        source: "quote",
      }, q.created_at);
    }
    for (const o of ordersRes.data || []) {
      upsert({
        key: keyFor({ email: o.client_email, name: o.client_name, phone: o.client_phone }),
        client_id: o.client_id ?? null,
        display_name: o.client_name || o.client_email || "Order client",
        email: o.client_email,
        phone: o.client_phone,
        last_event_date: o.event_date,
        last_guest_count: o.guest_count,
        last_venue_address: o.venue_address,
        source: "order",
      }, o.created_at);
    }

    // Compute the freshest source label per row
    for (const r of buckets.values()) {
      const primary = r.sources[0];
      const labelMap: Record<string, string> = {
        client: "Existing client",
        lead: "Lead",
        quote: "Quoted",
        order: "Ordered",
      };
      r.last_seen_label = relativeLabel(r.last_seen, labelMap[primary] ?? "Last seen");
    }

    // Rank: canonical clients first, then by recency
    const tierFor = (r: KnownClientResult) =>
      r.sources.includes("client") ? 0
      : r.sources.includes("lead") ? 1
      : r.sources.includes("quote") ? 2
      : 3;

    return Array.from(buckets.values())
      .sort((a, b) => {
        const tierDiff = tierFor(a) - tierFor(b);
        if (tierDiff !== 0) return tierDiff;
        return (b.last_seen || "").localeCompare(a.last_seen || "");
      })
      .slice(0, limit);
  },

  /**
   * Hydrate a full snapshot for a picked result. The UI passes the
   * client_id when known, otherwise the email -- we do the right thing
   * either way and merge the best-known data across sources.
   */
  async getClientSnapshot(
    companyId: string,
    args: { client_id?: string | null; email?: string | null; name?: string | null },
  ): Promise<ClientSnapshot | null> {
    const email = (args.email || "").trim().toLowerCase() || null;
    const clientId = args.client_id || null;
    if (!clientId && !email && !args.name) return null;

    // 1. Canonical client row
    let client: any = null;
    if (clientId) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      client = data || null;
    }
    if (!client && email) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .ilike("email", email)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      client = data || null;
    }

    // 2. Recent quotes for the same person -- by client_id when we have
    //    one, otherwise by email match
    const quoteFilter = clientId
      ? supabase.from("quotes").select("*").eq("client_id", clientId)
      : email
        ? supabase.from("quotes").select("*").ilike("client_email", email)
        : null;

    const recentQuotes = quoteFilter
      ? (await quoteFilter
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5)).data || []
      : [];

    // 3. Most recent order (for the latest known venue + event details)
    const orderFilter = clientId
      ? supabase.from("orders").select("event_date, guest_count, venue_address, venue_lat, venue_lng, client_phone")
          .eq("client_id", clientId)
      : email
        ? supabase.from("orders").select("event_date, guest_count, venue_address, venue_lat, venue_lng, client_phone")
            .ilike("client_email", email)
        : null;

    const lastOrder = orderFilter
      ? (await orderFilter
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)).data?.[0] || null
      : null;

    // 4. If still nothing, pull the most recent lead matching by email
    let lead: any = null;
    if (!client && email) {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .ilike("email", email)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lead = data || null;
    }

    // Merge: canonical client wins, lead fills holes, last quote / order
    // provides venue + event hints.
    const lastQuote = recentQuotes[0] || null;
    return {
      client_id: client?.id ?? null,
      full_name: client?.client_name
        ?? lead?.contact_name
        ?? lead?.company_name
        ?? lastQuote?.client_name
        ?? args.name
        ?? "",
      email: client?.email ?? lead?.email ?? lastQuote?.client_email ?? email,
      phone: client?.phone ?? lead?.phone ?? lastOrder?.client_phone ?? null,
      last_venue_address:
        lastOrder?.venue_address
        ?? lastQuote?.venue_address
        ?? lead?.venue_address
        ?? client?.billing_address_line1
        ?? null,
      last_venue_lat: lastOrder?.venue_lat ?? lastQuote?.venue_lat ?? null,
      last_venue_lng: lastOrder?.venue_lng ?? lastQuote?.venue_lng ?? null,
      last_event_date: lastOrder?.event_date ?? lastQuote?.event_date ?? lead?.event_date ?? null,
      last_event_type: lead?.event_type ?? null,
      last_guest_count: lastOrder?.guest_count ?? lastQuote?.guest_count ?? lead?.guest_count ?? null,
      recent_quotes: recentQuotes.map((q: any) => ({
        id: q.id,
        quote_number: q.quote_number ?? null,
        event_date: q.event_date ?? null,
        total_amount: q.total_amount ?? q.total ?? null,
        venue_address: q.venue_address ?? null,
        menu_items: q.menu_items ?? null,
        equipment_items: q.equipment_items ?? null,
        created_at: q.created_at ?? null,
      })),
      tags: client?.tags ?? [],
      notes: client?.notes ?? null,
    };
  },
};
