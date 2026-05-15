/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/leads/[id]/convert-to-order
 *
 * Server-side lead -> order conversion. Replaces the legacy
 * "/admin/quotes/new?fromQuoteId=..." redirect on the leads page,
 * which only cloned the quote rather than booking the order.
 *
 * Behaviour:
 *   1. Auth + tenant guard (super_admin / company_admin / admin / owner
 *      of the same company).
 *   2. Load the lead, find every quote attached to it (joined by
 *      lead_id OR by client_id when the lead has been promoted).
 *   3. Pick the best candidate quote: status='accepted' AND
 *      converted_to_order_id IS NULL. If multiple, take the most
 *      recent. If none, return 409 with error_code='no_accepted_quote'
 *      so the dialog can show the right next step.
 *   4. Build an orders payload from the quote and call the
 *      transactional convert_quote_to_order RPC via service-role.
 *      The RPC is SECURITY DEFINER and atomically inserts the order +
 *      back-links the quote, so no RLS gymnastics here.
 *   5. Stamp leads.converted_to_client_id if it isn't already (the
 *      RPC handles quotes.converted_to_order_id; lifecycle stamping
 *      on the lead is our job).
 *
 * Body: { confirm: true } -- explicit-confirm flag, no other params.
 *
 * Returns: { ok: true, order_id, order_number }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { lifecycleService } from "@/services/lifecycleService";
import { postOrderCreationCascade } from "@/services/order/postCreationCascade";

/**
 * Build an absolute origin from an incoming Next.js API request.
 * Vercel sets x-forwarded-proto + host on every request; in local
 * dev we fall back to req.headers.host with http://. Used as the
 * cascade origin so confirmation emails resolve links against the
 * environment that actually fielded the request, not whatever
 * NEXT_PUBLIC_SITE_URL was at build time.
 */
function getOrigin(req: NextApiRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (fromEnv) return fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "") as string;
  const proto = (req.headers["x-forwarded-proto"] || "https") as string;
  if (!host) return "";
  return `${proto}://${host}`;
}

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const leadId = String(req.query.id || "");
    if (!leadId) {
      return res.status(400).json({ error: "Lead id is required" });
    }

    const body = (req.body || {}) as any;
    if (body.confirm !== true) {
      return res.status(400).json({ error: "Missing confirm flag" });
    }

    // Auth gate via the user's session cookie.
    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user },
    } = await ssr.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: "Not signed in" });
    }

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = (((profile as any)?.active_role || (profile as any)?.role) || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    // Service-role client for the multi-table flip. The RPC is
    // SECURITY DEFINER but we use service-role for the surrounding
    // reads/writes (quotes lookup, lead stamp) so RLS doesn't
    // interfere mid-flight.
    const svc = getServiceSupabase();

    // 1. Load the lead.
    const { data: lead, error: leadErr } = await svc
      .from("leads")
      .select(
        "id, company_id, region_id, client_name, contact_name, client_email, email, client_phone, phone, tags, notes, converted_to_client_id, deleted_at"
      )
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr || !lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    if ((lead as any).deleted_at) {
      return res.status(410).json({ error: "Lead has been deleted" });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (lead as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Gate: refuse to convert a lead with no email on file unless
    // the operator passed allowMissingEmail=true in the body. Same
    // reasoning as quoteService.convertQuoteToOrder -- the deposit
    // invoice, confirmation email and portal magic-link all rely
    // on a client_email; without one the convert silently produces
    // an unmessaged order that the client only finds out about at
    // the venue. Operators can override for cash walk-ins / WhatsApp-
    // only contacts by passing the flag.
    const leadEmail = String(
      (lead as any).client_email || (lead as any).email || "",
    ).trim();
    const allowMissingEmail = (req.body || {}).allowMissingEmail === true;
    if (!leadEmail && !allowMissingEmail) {
      return res.status(400).json({
        error:
          "This lead has no email on file. The deposit invoice, confirmation email and portal magic-link all rely on it. Add an email to the lead, or retry with allowMissingEmail=true for a walk-in / cash-only client.",
        error_code: "no_client_email",
      });
    }

    // 2. Find candidate quotes -- by lead_id OR by client_id (covers
    // the case where the lead was promoted and a later quote was
    // created against the client without re-stamping lead_id).
    const clientId = (lead as any).converted_to_client_id as string | null;
    const orFilter = clientId
      ? `lead_id.eq.${leadId},client_id.eq.${clientId}`
      : `lead_id.eq.${leadId}`;
    const { data: quotes, error: quotesErr } = await svc
      .from("quotes")
      .select("id, status, converted_to_order_id, created_at, lead_id, client_id, total")
      .eq("company_id", (lead as any).company_id)
      .is("deleted_at", null)
      .or(orFilter)
      .order("created_at", { ascending: false });
    if (quotesErr) {
      console.error("[leads/convert-to-order] quotes lookup failed:", quotesErr);
      return res.status(500).json({ error: quotesErr.message });
    }

    const quoteList = quotes || [];
    const hasQuotes = quoteList.length > 0;

    // If the lead is already linked to an order via a converted quote,
    // surface that order rather than refusing -- the caller can deep-link.
    const alreadyConverted = quoteList.find((q: any) => q.converted_to_order_id);
    if (alreadyConverted) {
      const { data: existingOrder, error: existingOrderErr } = await svc
        .from("orders")
        .select("id, order_number")
        .eq("id", (alreadyConverted as any).converted_to_order_id)
        .maybeSingle();
      if (existingOrderErr) {
        console.error("[admin/leads/[id]/convert-to-order] orders fetch failed:", existingOrderErr);
      }
      if (existingOrder) {
        // Re-run the cascade on already-converted leads. Each step is
        // idempotent (invoice short-circuits on existing row; email
        // logs to email_automation_log; kitchen prep bails when
        // pending tasks already exist) so this is safe and recovers
        // any partial failure from the original conversion.
        const retryCascade = await postOrderCreationCascade(
          svc as any,
          (existingOrder as any).id,
          (lead as any).company_id,
          user.id,
          { origin: getOrigin(req) },
        );
        return res.status(200).json({
          ok: true,
          already_converted: true,
          order_id: (existingOrder as any).id,
          order_number: (existingOrder as any).order_number || null,
          cascade: retryCascade,
        });
      }
    }

    // 3. Pick the best convertible candidate.
    const candidate = quoteList.find(
      (q: any) => q.status === "accepted" && !q.converted_to_order_id
    );
    if (!candidate) {
      return res.status(409).json({
        error_code: "no_accepted_quote",
        error: hasQuotes
          ? "This lead has a quote out, but it isn't accepted yet. Mark the quote accepted first, then come back here."
          : "This lead doesn't have a quote yet. Create one first, get it accepted, then convert.",
        has_quotes: hasQuotes,
      });
    }

    // Re-read the chosen quote in full so the order payload has every
    // field. We keep this read service-role to bypass RLS quirks.
    const { data: fullQuote, error: fullQuoteErr } = await svc
      .from("quotes")
      .select("*")
      .eq("id", (candidate as any).id)
      .maybeSingle();
    if (fullQuoteErr || !fullQuote) {
      return res.status(500).json({ error: fullQuoteErr?.message || "Could not load quote" });
    }
    const q = fullQuote as any;

    // 4. Resolve the client. Delegated to lifecycleService so the
    // promotion path matches what quoteService.convertQuoteToOrder
    // does -- the audit flagged that this route was re-implementing
    // the same logic inline. The service also stamps
    // leads.converted_to_client_id + audit-logs the promotion, so
    // the explicit lead stamp at the end of this route is now a
    // no-op safety net rather than the only stamp path.
    let resolvedClientId: string | null = q.client_id || (lead as any).converted_to_client_id || null;
    if (!resolvedClientId) {
      try {
        resolvedClientId = await lifecycleService.resolveQuoteClientId(
          { id: q.id, client_id: q.client_id || null, lead_id: leadId },
          { client: svc as any },
        );
      } catch (resolveErr: any) {
        console.error("[leads/convert-to-order] client resolution failed:", resolveErr);
        return res.status(500).json({
          error: resolveErr?.message || "Could not resolve a client for this lead",
        });
      }
    }

    // 5. Build the orders payload. Mirrors quoteService.convertQuoteToOrder
    // -- whitelist columns explicitly so quote-only fields don't leak in.
    const orderData: any = {
      quote_id: q.id,
      user_id: q.user_id,
      client_id: resolvedClientId,
      company_id: q.company_id,
      region_id: q.region_id,
      client_name: q.client_name,
      client_email: q.client_email,
      client_phone: q.client_phone,
      event_name: q.event_name ?? q.quote_name ?? null,
      event_date: q.event_date,
      event_time: q.event_time ?? null,
      setup_time: q.setup_time ?? null,
      guest_count: q.guest_count ?? null,
      venue_address: q.venue_address ?? null,
      venue_lat: q.venue_lat ?? null,
      venue_lng: q.venue_lng ?? null,
      subtotal: q.subtotal ?? null,
      discount_amount: q.discount_amount ?? null,
      tax_amount: q.tax_amount ?? q.tax ?? null,
      tax: q.tax ?? q.tax_amount ?? null,
      total_amount: q.total ?? q.total_amount ?? null,
      currency: q.currency ?? "ZAR",
      deposit_percentage: q.deposit_percentage ?? null,
      delivery_fee: q.delivery_fee ?? null,
      delivery_distance_km: q.delivery_distance_km ?? null,
      delivery_rate_per_km: q.delivery_rate_per_km ?? null,
      delivery_duration_minutes: null,
      delivery_route_optimized: false,
      internal_notes: q.notes ?? null,
      status: "confirmed",
      // Stamp confirmed_at so Booked-revenue tile and every other
      // gate keyed on this column counts the order from creation.
      // See quoteService.convertQuoteToOrder for the matching write.
      confirmed_at: new Date().toISOString(),
      whatsapp_notifications_sent: [],
      xero_invoice_id: null,
      xero_synced_at: null,
    };

    // 6. Atomic convert via the RPC.
    const { data: rpcOrder, error: rpcError } = await (svc as any).rpc(
      "convert_quote_to_order",
      {
        p_quote_id: q.id,
        p_company_id: q.company_id,
        p_actor_user_id: user.id,
        p_order_payload: orderData,
      }
    );
    if (rpcError || !rpcOrder) {
      console.error("[leads/convert-to-order] RPC failed:", rpcError);
      return res.status(500).json({
        error: rpcError?.message || "Could not convert the quote (transaction rolled back).",
      });
    }
    const newOrder: any = Array.isArray(rpcOrder) ? rpcOrder[0] : rpcOrder;

    // 7. Stamp the lead's converted_to_client_id if it isn't already.
    if (!(lead as any).converted_to_client_id && resolvedClientId) {
      const { error: stampErr } = await svc
        .from("leads")
        .update({
          converted_to_client_id: resolvedClientId,
          converted_at: new Date().toISOString(),
          status: "won",
        } as any)
        .eq("id", leadId);
      if (stampErr) {
        // Non-blocking: the order is already booked. Log and continue.
        console.warn("[leads/convert-to-order] lead stamp failed:", stampErr);
      }
    }

    // 8. Audit log so the contact timeline shows "lead booked into
    // order O-0042". Best-effort.
    try {
      await (svc as any).from("audit_logs").insert({
        company_id: (lead as any).company_id,
        user_id: user.id,
        action: "lead_converted_to_order",
        entity_type: "lead",
        entity_id: leadId,
        details: {
          order_id: newOrder.id,
          order_number: newOrder.order_number || null,
          quote_id: q.id,
          client_id: resolvedClientId,
        },
      });
    } catch (e) {
      console.warn("[leads/convert-to-order] audit insert failed:", e);
    }

    // 9. Post-creation cascade. Mirrors what quoteService.convertQuoteToOrder
    // runs in the browser path: auto-invoice, confirmation email,
    // kitchen prep tasks. Service-role client + req-derived origin so
    // the email links resolve and RLS doesn't block any of the side-
    // effect writes. Cascade never throws -- the receipt records each
    // step's outcome and is forwarded to the caller.
    const cascade = await postOrderCreationCascade(
      svc as any,
      newOrder.id,
      (lead as any).company_id,
      user.id,
      { origin: getOrigin(req) },
    );

    return res.status(200).json({
      ok: true,
      cascade,
      order_id: newOrder.id,
      order_number: newOrder.order_number || null,
    });
  } catch (err: any) {
    console.error("[leads/convert-to-order] crashed:", err);
    return res.status(500).json({ error: err?.message || "Convert lead to order failed" });
  }
}
