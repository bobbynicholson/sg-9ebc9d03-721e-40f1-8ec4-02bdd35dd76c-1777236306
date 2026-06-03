/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/quotes/[id]/resync-order
 *
 * TIGHTEN I.127 (2026-06-03): server-side propagation of a quote's
 * current state onto its linked order.
 *
 * Background: propagateQuoteEditToOrder existed as a client-side JS
 * helper that /admin/quotes/new called after every save. In testing
 * Bobby saved a converted quote and watched the quote update (guests
 * 26 -> 28, menu items 8x -> 28x, equipment 8x -> 28x, total
 * R3601.71 -> R4092) but the linked order stayed entirely on the
 * old values. The browser-side propagator either silently failed
 * (RLS edge case, network) or didn't fire (closure / race), and the
 * client never knew. Bobby flagged it as a "one quote, two truths"
 * incident and demanded the propagation be bulletproof.
 *
 * This endpoint:
 *   1. Runs server-side under SERVICE ROLE so RLS never silently
 *      blocks the update.
 *   2. Updates orders headline fields (guests, totals, dates, venue,
 *      etc.) from the quote.
 *   3. Hard-rebuilds order_items from quote.menu_items so quantities
 *      always match.
 *   4. Resyncs equipment_bookings quantities from quote.equipment_items.
 *   5. Returns a structured receipt the caller can surface to the
 *      operator ("3 items rebuilt, equipment rewindowed, X errors").
 *
 * The browser-side propagator (with its richer cascade - balance due
 * date, prep tasks, driver assignments, email queue) still runs from
 * /admin/quotes/new. This endpoint is the defensive belt-and-braces
 * call that fires AFTER the browser-side helper so if it failed, this
 * one catches up.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

const POST_DISPATCH_STATUSES = new Set([
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
]);

interface ResyncReceipt {
  ok: boolean;
  reason?: string;
  orderId?: string;
  orderNumber?: string;
  noLinkedOrder?: boolean;
  refusedPostDispatch?: boolean;
  orderHeadlineUpdated: boolean;
  orderItemsRebuilt: number;
  equipmentBookingsResynced: number;
  errors: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const quoteId = String(req.query.id || "");
  if (!quoteId) return res.status(400).json({ error: "Quote id required" });

  // Auth: any admin / sales role for this tenant. Reuse the standard
  // SSR client to verify identity.
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });
  const { data: profile } = await ssr
    .from("profiles")
    .select("company_id, active_role, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return res.status(403).json({ error: "No profile" });

  const sb = getServiceSupabase() as any;

  // Load the quote so we know what to push.
  const { data: quote, error: qErr } = await sb
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr || !quote) {
    return res.status(404).json({ error: qErr?.message || "Quote not found" });
  }

  // Tenant scope check.
  const role = String((profile as any).active_role || (profile as any).role || "");
  if (role !== "super_admin" && (profile as any).company_id !== (quote as any).company_id) {
    return res.status(403).json({ error: "Wrong tenant" });
  }

  // Find the linked order.
  const { data: linkedOrder } = await sb
    .from("orders")
    .select("id, order_number, status, deleted_at")
    .eq("quote_id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();

  const receipt: ResyncReceipt = {
    ok: true,
    orderId: undefined,
    orderNumber: undefined,
    orderHeadlineUpdated: false,
    orderItemsRebuilt: 0,
    equipmentBookingsResynced: 0,
    errors: [],
  };

  if (!linkedOrder) {
    receipt.noLinkedOrder = true;
    return res.status(200).json(receipt);
  }
  receipt.orderId = (linkedOrder as any).id;
  receipt.orderNumber = (linkedOrder as any).order_number;

  // Refuse on post-dispatch statuses.
  if (POST_DISPATCH_STATUSES.has(String((linkedOrder as any).status || "").toLowerCase())) {
    receipt.refusedPostDispatch = true;
    receipt.ok = false;
    receipt.reason = "order_past_dispatch";
    return res.status(200).json(receipt);
  }

  // 1. Headline fields. Service-role bypasses RLS so this lands even
  //    when the user's session is borderline (region edge case,
  //    role drift).
  try {
    const headlinePatch: Record<string, any> = {
      guest_count:     (quote as any).guest_count ?? null,
      event_date:      (quote as any).event_date ?? null,
      event_time:      (quote as any).event_time ?? null,
      setup_time:      (quote as any).setup_time ?? null,
      venue_address:   (quote as any).venue_address ?? null,
      venue_lat:       (quote as any).venue_lat ?? null,
      venue_lng:       (quote as any).venue_lng ?? null,
      client_name:     (quote as any).client_name ?? null,
      client_email:    (quote as any).client_email ?? null,
      client_phone:    (quote as any).client_phone ?? null,
      event_name:      (quote as any).quote_name ?? null,
      subtotal:        (quote as any).subtotal ?? null,
      tax_amount:      (quote as any).tax_amount ?? null,
      tax:             (quote as any).tax ?? null,
      total_amount:    (quote as any).total ?? null,
      discount_amount: (quote as any).discount_amount ?? null,
      delivery_fee:    (quote as any).delivery_fee ?? null,
      delivery_distance_km: (quote as any).delivery_distance_km ?? null,
      delivery_rate_per_km: (quote as any).delivery_rate_per_km ?? null,
      deposit_percentage:   (quote as any).deposit_percentage ?? null,
      region_id:       (quote as any).region_id ?? null,
    };
    const { error: updErr } = await sb
      .from("orders")
      .update(headlinePatch)
      .eq("id", receipt.orderId);
    if (updErr) {
      receipt.errors.push(`order_update_failed: ${updErr.message}`);
    } else {
      receipt.orderHeadlineUpdated = true;
    }
  } catch (e: any) {
    receipt.errors.push(`order_update_crashed: ${e?.message || e}`);
  }

  // 2. Rebuild order_items from quote.menu_items. Hard delete + insert
  //    is simpler than diff and idempotent.
  try {
    const { error: delErr } = await sb
      .from("order_items")
      .delete()
      .eq("order_id", receipt.orderId);
    if (delErr) {
      receipt.errors.push(`order_items_delete_failed: ${delErr.message}`);
    } else {
      const rawMenu = (quote as any).menu_items;
      const items: any[] = Array.isArray(rawMenu)
        ? rawMenu
        : typeof rawMenu === "string"
          ? (() => { try { const p = JSON.parse(rawMenu); return Array.isArray(p) ? p : []; } catch { return []; } })()
          : [];
      const guestCount = Number((quote as any).guest_count || 0);
      const rows = items
        .map((it: any) => {
          const name = it.item_name || it.name || "";
          if (!name) return null;
          const mode = String(it.pricing_mode || it.pricingMode || "per_person");
          const baseQty = Number(it.quantity || 0);
          const qty = mode === "per_person"
            ? (baseQty > 0 ? baseQty : guestCount)
            : (mode === "flat" ? 1 : baseQty);
          const unit = Number(it.unit_price ?? it.unitPrice ?? it.pricePerPerson ?? 0);
          const lineTotal = Number(it.line_total ?? (qty * unit));
          return {
            order_id: receipt.orderId,
            menu_item_id: it.menu_item_id || null,
            item_name: name,
            description: it.category || it.dietary_tags?.join?.(", ") || null,
            quantity: qty,
            unit_price: unit,
            line_total: lineTotal,
          };
        })
        .filter(Boolean);
      if (rows.length > 0) {
        const { error: insErr } = await sb.from("order_items").insert(rows);
        if (insErr) {
          receipt.errors.push(`order_items_insert_failed: ${insErr.message}`);
        } else {
          receipt.orderItemsRebuilt = rows.length;
        }
      }
    }
  } catch (e: any) {
    receipt.errors.push(`order_items_rebuild_crashed: ${e?.message || e}`);
  }

  // 3. Equipment bookings - mirror quantities from quote.equipment_items
  //    onto the existing bookings rows. Booking IDs (event-date window)
  //    are left untouched - only the qty changes here, which is the
  //    common case for guest-count edits. The browser-side propagator
  //    handles the full booking life-cycle (new equipment added,
  //    window changes) so this server endpoint stays focused on
  //    quantity sync, the most common drift.
  try {
    const rawEq = (quote as any).equipment_items;
    const eqItems: any[] = Array.isArray(rawEq)
      ? rawEq
      : typeof rawEq === "string"
        ? (() => { try { const p = JSON.parse(rawEq); return Array.isArray(p) ? p : []; } catch { return []; } })()
        : [];
    for (const it of eqItems) {
      const eqId = it.equipment_id || null;
      const qty = Number(it.quantity || 0);
      if (!eqId || qty <= 0) continue;
      const { error: ebErr, data: ebData } = await sb
        .from("equipment_bookings")
        .update({ quantity: qty })
        .eq("order_id", receipt.orderId)
        .eq("equipment_id", eqId)
        .select("id");
      if (ebErr) {
        receipt.errors.push(`equipment_booking_update_failed_${eqId}: ${ebErr.message}`);
      } else if (Array.isArray(ebData)) {
        receipt.equipmentBookingsResynced += ebData.length;
      }
    }
  } catch (e: any) {
    receipt.errors.push(`equipment_bookings_resync_crashed: ${e?.message || e}`);
  }

  // Stamp a single audit row so we can trace which save triggered
  // this resync.
  try {
    await sb.from("audit_logs").insert({
      company_id: (quote as any).company_id,
      order_id: receipt.orderId,
      user_id: user.id,
      action: "quote_resynced_to_order",
      entity_type: "orders",
      entity_id: receipt.orderId,
      metadata: {
        quote_id: quoteId,
        quote_number: (quote as any).quote_number,
        order_number: receipt.orderNumber,
        items_rebuilt: receipt.orderItemsRebuilt,
        bookings_resynced: receipt.equipmentBookingsResynced,
        headline_updated: receipt.orderHeadlineUpdated,
        errors: receipt.errors,
      },
    });
  } catch (e) {
    console.warn("[quotes/resync-order] audit insert failed:", e);
  }

  return res.status(200).json(receipt);
}
