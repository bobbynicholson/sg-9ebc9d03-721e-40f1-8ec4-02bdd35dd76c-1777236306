/**
 * POST /api/orders/amendment-request
 *
 * Client-facing endpoint to request a late change to a confirmed
 * order (guest count tweak, menu swap, venue change). The request
 * is captured in order_amendment_requests for the catering team to
 * review. Approval triggers the cascade (kitchen prep regen,
 * shopping list refresh, invoice diff) -- handled by the admin
 * approval endpoint, not here.
 *
 * Auth: client must be authenticated AND own the order. The order
 * must be inside its company's amendment window
 * (is_order_amendable RPC).
 *
 * Body:
 *   {
 *     order_id: string,
 *     proposed_changes: {
 *       guest_count?: number,
 *       menu_items?: Array<...>,
 *       equipment_items?: Array<...>,
 *       special_instructions?: string,
 *       delivery_time?: string,    // ISO time
 *       venue_address?: string
 *     },
 *     client_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ALLOWED_FIELDS = new Set([
  "guest_count",
  "menu_items",
  "equipment_items",
  "special_instructions",
  "delivery_time",
  "venue_address",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to request a change" });

    const { order_id, proposed_changes, client_notes } = (req.body || {}) as any;
    if (!order_id || typeof order_id !== "string") {
      return res.status(400).json({ error: "order_id is required" });
    }
    if (!proposed_changes || typeof proposed_changes !== "object" || Array.isArray(proposed_changes)) {
      return res.status(400).json({ error: "proposed_changes must be an object" });
    }

    // Strip any keys the client isn't allowed to amend. Everything
    // else (status, total, payment_status, anything financial /
    // workflow-related) is admin-only by design.
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(proposed_changes)) {
      if (ALLOWED_FIELDS.has(k)) sanitized[k] = v;
    }

    // Allow notes-only amendments. The dialog already lets the client
    // submit just a note (e.g. "please confirm dietaries before Friday")
    // without any field change, but the API used to reject these. The
    // amendment record still gets created so the catering team sees
    // the question in their review queue.
    const notesProvided = typeof client_notes === "string" && client_notes.trim().length > 0;
    if (Object.keys(sanitized).length === 0 && !notesProvided) {
      return res.status(400).json({
        error: "Add at least one field change or include a note for the team",
      });
    }

    // Look up the order + verify ownership + amendable window.
    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, client_id, event_date, status, deleted_at")
      .eq("id", order_id)
      .maybeSingle();
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Ownership: either the authenticated user is the linked client,
    // or they're admin/owner in the same company. Anything else
    // shouldn't be making this call.
    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    const isAdminInCompany =
      ["super_admin", "company_admin", "admin", "owner"].includes(role) &&
      (profile as any)?.company_id === (order as any).company_id;
    const isLinkedClient = (order as any).client_id === user.id;
    if (!isAdminInCompany && !isLinkedClient) {
      return res.status(403).json({ error: "Not allowed to amend this order" });
    }

    // Amendable window: bypass the check for admins (they're typing
    // it up on behalf of the client and may be inside the cutoff
    // for legitimate reasons). Clients are gated.
    if (!isAdminInCompany) {
      const { data: amendable } = await ssr.rpc("is_order_amendable", {
        p_order_id: order_id,
      });
      if (amendable !== true) {
        return res.status(409).json({
          error: "This order is past the amendment cutoff. Please contact us directly.",
        });
      }
    }

    const { data: inserted, error } = await ssr
      .from("order_amendment_requests")
      .insert({
        order_id,
        company_id: (order as any).company_id,
        requested_by_user_id: user.id,
        proposed_changes: sanitized,
        client_notes: client_notes || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Notify the catering team. Best-effort, non-blocking.
    try {
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.createNotification({
        company_id: (order as any).company_id,
        user_id: (order as any).company_id,
        recipient_id: (order as any).company_id,
        notification_type: "amendment_requested",
        title: "Amendment requested",
        message: `A client wants to change their confirmed order. Review and approve.`,
        priority: "high",
        link: `/admin/orders?orderId=${order_id}&amendment=${(inserted as any).id}`,
      } as any);
    } catch (e) {
      console.warn("[amendment-request] notify failed:", e);
    }

    return res.status(200).json({ ok: true, request_id: (inserted as any).id });
  } catch (err: any) {
    console.error("[amendment-request] crashed:", err);
    return res.status(500).json({ error: err?.message || "Could not submit amendment request" });
  }
}
