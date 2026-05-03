/**
 * POST /api/orders/amendment-review
 *
 * Admin reviews a pending amendment request -- approve, reject, or
 * partial-approve. Approval applies the diff to the order row and
 * triggers the cascade: kitchen prep regen, shopping list refresh,
 * inventory deduction recalc, invoice update if the total changed.
 *
 * Auth: caller must be admin/owner in the same company as the
 * request.
 *
 * Body:
 *   {
 *     request_id: string,
 *     action: 'approve' | 'reject' | 'approve_partial',
 *     // for approve_partial only: which keys to apply
 *     apply_keys?: string[],
 *     review_notes?: string
 *   }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
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
    // Cast through any for the new order_amendment_requests table --
    // the generated types haven't picked it up yet. Same pattern as
    // the request endpoint.
    const ssrAny = ssr as any;
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Owner or admin only" });
    }

    const { request_id, action, apply_keys, review_notes } = (req.body || {}) as any;
    if (!request_id || !["approve", "reject", "approve_partial"].includes(action)) {
      return res.status(400).json({ error: "Invalid request_id or action" });
    }

    const { data: request } = await ssrAny
      .from("order_amendment_requests")
      .select("id, order_id, company_id, proposed_changes, status")
      .eq("id", request_id)
      .maybeSingle();
    if (!request) return res.status(404).json({ error: "Amendment request not found" });
    if ((request as any).status !== "pending") {
      return res.status(409).json({ error: `Request is already ${(request as any).status}` });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (request as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }

    const nowIso = new Date().toISOString();

    if (action === "reject") {
      await ssrAny.from("order_amendment_requests").update({
        status: "rejected",
        reviewed_by_user_id: user.id,
        reviewed_at: nowIso,
        review_notes: review_notes || null,
      } as any).eq("id", request_id);
      return res.status(200).json({ ok: true, applied: 0 });
    }

    // Determine which keys to apply.
    const proposed = (request as any).proposed_changes || {};
    let toApply: Record<string, any> = {};
    if (action === "approve") {
      toApply = { ...proposed };
    } else {
      // approve_partial -- intersect proposed with apply_keys.
      if (!Array.isArray(apply_keys) || apply_keys.length === 0) {
        return res.status(400).json({ error: "apply_keys required for approve_partial" });
      }
      for (const k of apply_keys) {
        if (k in proposed && ALLOWED_FIELDS.has(k)) toApply[k] = proposed[k];
      }
    }
    if (Object.keys(toApply).length === 0) {
      return res.status(400).json({ error: "No amendable keys to apply" });
    }

    // Snapshot current order values for the keys we're about to change.
    const { data: orderBefore } = await ssr
      .from("orders")
      .select(Array.from(ALLOWED_FIELDS).join(", "))
      .eq("id", (request as any).order_id)
      .maybeSingle();
    const snapshot: Record<string, any> = {};
    for (const k of Object.keys(toApply)) {
      snapshot[k] = orderBefore ? (orderBefore as any)[k] : null;
    }

    // Apply the diff to the orders row.
    const { error: updateErr } = await ssr
      .from("orders")
      .update({
        ...toApply,
        updated_at: nowIso,
      } as any)
      .eq("id", (request as any).order_id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Stamp the request as approved + capture snapshot.
    await ssrAny.from("order_amendment_requests").update({
      status: action === "approve_partial" && Object.keys(toApply).length < Object.keys(proposed).length
        ? "approved" // still 'approved' even when partial -- keys list lives in applied_snapshot
        : "approved",
      reviewed_by_user_id: user.id,
      reviewed_at: nowIso,
      review_notes: review_notes || null,
      applied_snapshot: { before: snapshot, applied_keys: Object.keys(toApply) },
      applied_at: nowIso,
    } as any).eq("id", request_id);

    // Cascade: kitchen prep regen + invoice diff. Both fire-and-forget
    // so a failed cascade doesn't undo the amendment itself.
    void (async () => {
      try {
        const { kitchenPrepService } = await import("@/services/kitchenPrepService");
        await (kitchenPrepService as any).ensurePrepTasksForOrder(
          (request as any).company_id,
          (request as any).order_id,
        );
      } catch (e) {
        console.warn("[amendment-review] kitchen prep regen failed:", e);
      }
    })();

    void (async () => {
      try {
        // Drop any existing invoice for this order, the auto-invoice
        // helper will regen on next confirm-equivalent action. For now
        // we just nudge it -- a future iteration adds a proper diff
        // / amendment-invoice flow.
        const { ensureInvoiceForOrder } = await import("@/services/invoiceGenerationService");
        await ensureInvoiceForOrder((request as any).order_id, (request as any).company_id);
      } catch (e) {
        console.warn("[amendment-review] invoice refresh failed:", e);
      }
    })();

    // Inventory cascade. Only fire when the amendment touched
    // guest_count, menu_items, or equipment_items -- those are the
    // keys that change what's needed from the kitchen / store. A pure
    // venue / time amendment doesn't need a recalc.
    const inventoryRelevant = ["guest_count", "menu_items", "equipment_items"];
    const touchedInventory = Object.keys(toApply).some((k) => inventoryRelevant.includes(k));
    if (touchedInventory) {
      void (async () => {
        try {
          const { recalculateInventoryForOrder } = await import("@/services/inventoryDeductionService");
          const result = await recalculateInventoryForOrder(
            (request as any).order_id,
            (request as any).company_id,
            user.id,
          );
          if (!result.success) {
            console.warn("[amendment-review] inventory recalc had errors:", result.errors);
          }
        } catch (e) {
          console.warn("[amendment-review] inventory recalc crashed:", e);
        }
      })();
    }

    return res.status(200).json({
      ok: true,
      applied: Object.keys(toApply).length,
      applied_keys: Object.keys(toApply),
      inventory_recalc_queued: touchedInventory,
    });
  } catch (err: any) {
    console.error("[amendment-review] crashed:", err);
    return res.status(500).json({ error: err?.message || "Amendment review failed" });
  }
}
