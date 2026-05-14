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
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";

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

    const { data: request } = await ssr
      .from("order_amendment_requests")
      .select("id, order_id, company_id, proposed_changes, status, requested_by_user_id")
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
      await ssr.from("order_amendment_requests").update({
        status: "rejected",
        reviewed_by_user_id: user.id,
        reviewed_at: nowIso,
        review_notes: review_notes || null,
      } as any).eq("id", request_id);

      // Notify the client that their change request was declined.
      // Best-effort -- a notification failure must not roll back the
      // review. requested_by_user_id is the client's auth uid, fall
      // back to the orders->clients lookup if it's missing.
      try {
        const { data: orderRow } = await ssr
          .from("orders")
          .select("client_id, order_number")
          .eq("id", (request as any).order_id)
          .maybeSingle();
        const recipientId =
          (request as any).requested_by_user_id ||
          (await resolveClientUserId(ssr, (orderRow as any)?.client_id));
        if (recipientId) {
          const { notificationService } = await import("@/services/notificationService");
          await notificationService.createNotification({
            company_id: (request as any).company_id,
            recipient_id: recipientId,
            user_id: user.id,
            notification_type: "amendment_rejected",
            title: "Change request declined",
            message: review_notes
              ? `We couldn't apply your change request. Reason from the team: ${review_notes}`
              : "We couldn't apply your change request. Please get in touch and we'll work it out.",
            priority: "high",
            link: `/client-portal/my-orders?orderId=${(request as any).order_id}`,
            related_entity_type: "order",
            related_entity_id: (request as any).order_id,
          });
        }
      } catch (e) {
        console.warn("[amendment-review] reject notify failed:", e);
      }

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

    // Wave 21 audit: amendment-review applied the diff (guest_count,
    // menu_items, equipment_items) but never recomputed orders.subtotal /
    // tax_amount / total_amount. recalcInvoiceForOrder below pulls the
    // GROSS from orders.total_amount when the tenant is inc-VAT (Wave
    // 17 fix), so a stale orders.total_amount produced an invoice that
    // didn't match the new spec. Recompute order totals from the live
    // order_items + delivery + waiter rows BEFORE the invoice cascade
    // so both sides agree.
    if (Object.keys(toApply).some((k) => ["guest_count", "menu_items", "equipment_items"].includes(k))) {
      try {
        const { data: items } = await ssr
          .from("order_items")
          .select("unit_price, quantity")
          .eq("order_id", (request as any).order_id);
        const { data: orderRow } = await ssr
          .from("orders")
          .select("delivery_fee, waiter_total_fee, region_id, company_id")
          .eq("id", (request as any).order_id)
          .maybeSingle();
        const lineSum = ((items || []) as any[]).reduce(
          (s, it) => s + Number(it.quantity ?? 1) * Number(it.unit_price ?? 0),
          0,
        );
        const deliveryFee = Number((orderRow as any)?.delivery_fee || 0);
        const waiterFee = Number((orderRow as any)?.waiter_total_fee || 0);
        const lineSumPlus = lineSum + deliveryFee + waiterFee;
        // Resolve the per-tenant VAT rate + pricing convention from
        // the branch settings. Same source the invoice generator uses.
        const { resolveBranchSettings } = await import("@/services/branchSettingsService");
        const branch = await resolveBranchSettings(
          (orderRow as any)?.company_id,
          ((orderRow as any)?.region_id as string | null) ?? null,
        );
        const taxRate = branch.vatRegistered ? Number(branch.vatRate) : 0;
        const { data: companyVat } = await ssr
          .from("companies")
          .select("pricing_includes_vat")
          .eq("id", (orderRow as any)?.company_id)
          .maybeSingle();
        const incVat = (companyVat as any)?.pricing_includes_vat === true;
        const { calculateOrderTotal } = await import("@/services/order/orderFinancials");
        const totals = await calculateOrderTotal(
          [{ unit_price: lineSumPlus, quantity: 1 }],
          taxRate,
          incVat ? "inc" : "ex",
        );
        await ssr
          .from("orders")
          .update({
            subtotal: totals.subtotal,
            tax_amount: totals.tax,
            total_amount: totals.total,
            updated_at: nowIso,
          } as any)
          .eq("id", (request as any).order_id);
      } catch (e) {
        console.warn("[amendment-review] order total recompute failed (non-blocking):", e);
      }
    }

    // Stamp the request as approved + capture snapshot.
    await ssr.from("order_amendment_requests").update({
      status: action === "approve_partial" && Object.keys(toApply).length < Object.keys(proposed).length
        ? "approved" // still 'approved' even when partial -- keys list lives in applied_snapshot
        : "approved",
      reviewed_by_user_id: user.id,
      reviewed_at: nowIso,
      review_notes: review_notes || null,
      applied_snapshot: { before: snapshot, applied_keys: Object.keys(toApply) },
      applied_at: nowIso,
    } as any).eq("id", request_id);

    // Cascade: kitchen prep regen + invoice diff + inventory recalc.
    // Previously these were fire-and-forget so a serverless cold-stop
    // between approval and cascade completion left the order amended
    // with stale prep tasks / invoice / inventory and nobody knew
    // [P0-08]. Now the cascade is awaited and each step's result is
    // returned in the response, so the operator can re-trigger any
    // step that failed (or the receipt object plugs into the future
    // retry endpoint without reshaping).
    const cascade: {
      kitchen_prep: { ok: boolean; reason?: string };
      invoice: { ok: boolean; reason?: string };
      inventory: { ok: boolean; reason?: string; skipped?: boolean };
    } = {
      kitchen_prep: { ok: false },
      invoice: { ok: false },
      inventory: { ok: false, skipped: true },
    };

    try {
      const { kitchenPrepService } = await import("@/services/kitchenPrepService");
      await (kitchenPrepService as any).ensurePrepTasksForOrder(
        (request as any).company_id,
        (request as any).order_id,
      );
      cascade.kitchen_prep.ok = true;
    } catch (e: any) {
      cascade.kitchen_prep.reason = e?.message || "kitchen prep regen failed";
      console.warn("[amendment-review] kitchen prep regen failed:", e);
    }

    try {
      const {
        ensureInvoiceForOrder,
        recalcInvoiceForOrder,
      } = await import("@/services/invoiceGenerationService");
      // Flow audit Leg C P0-4: ensureInvoiceForOrder no-ops when an
      // invoice already exists, so previously the amendment shifted
      // the order total but left the invoice + balance_due frozen.
      // Try to recalc first; if no invoice exists yet (rare for an
      // order under amendment), fall back to ensure.
      const recalc = await recalcInvoiceForOrder(
        (request as any).order_id,
        (request as any).company_id,
        ssr,
      );
      if (recalc.success && recalc.updated) {
        cascade.invoice.ok = true;
      } else if (recalc.reason === "no_invoice") {
        await ensureInvoiceForOrder(
          (request as any).order_id,
          (request as any).company_id,
          ssr,
        );
        cascade.invoice.ok = true;
      } else {
        cascade.invoice.ok = false;
        cascade.invoice.reason = recalc.error || recalc.reason || "invoice recalc returned no update";
      }
    } catch (e: any) {
      cascade.invoice.reason = e?.message || "invoice refresh failed";
      console.warn("[amendment-review] invoice refresh failed:", e);
    }

    // Inventory cascade. Only fire when the amendment touched
    // guest_count, menu_items, or equipment_items.
    const inventoryRelevant = ["guest_count", "menu_items", "equipment_items"];
    const touchedInventory = Object.keys(toApply).some((k) => inventoryRelevant.includes(k));
    if (touchedInventory) {
      cascade.inventory = { ok: false, skipped: false };
      try {
        const { recalculateInventoryForOrder } = await import("@/services/inventoryDeductionService");
        const result = await recalculateInventoryForOrder(
          (request as any).order_id,
          (request as any).company_id,
          user.id,
        );
        cascade.inventory.ok = !!result.success;
        if (!result.success) {
          cascade.inventory.reason = (result.errors || []).join("; ") || "inventory recalc errors";
        }
      } catch (e: any) {
        cascade.inventory.reason = e?.message || "inventory recalc crashed";
        console.warn("[amendment-review] inventory recalc crashed:", e);
      }
    }

    // Persist cascade outcome on the request row so the operator can
    // see at a glance which steps need a retry, and so a future retry
    // endpoint can pick up where this one left off.
    await ssr.from("order_amendment_requests").update({
      applied_snapshot: {
        before: snapshot,
        applied_keys: Object.keys(toApply),
        cascade,
      },
    } as any).eq("id", request_id);

    // Notify the client that their change went through. Best-effort
    // -- a notification failure must not roll back the amendment.
    try {
      const { data: orderRow } = await ssr
        .from("orders")
        .select("client_id, order_number")
        .eq("id", (request as any).order_id)
        .maybeSingle();
      const recipientId =
        (request as any).requested_by_user_id ||
        (await resolveClientUserId(ssr, (orderRow as any)?.client_id));
      if (recipientId) {
        const partial = action === "approve_partial";
        const appliedList = Object.keys(toApply)
          .map((k) => k.replace(/_/g, " "))
          .join(", ");
        const { notificationService } = await import("@/services/notificationService");
        await notificationService.createNotification({
          company_id: (request as any).company_id,
          recipient_id: recipientId,
          user_id: user.id,
          notification_type: partial ? "amendment_partial_approved" : "amendment_approved",
          title: partial ? "Change request partly applied" : "Change request approved",
          message: partial
            ? `We applied part of your change request: ${appliedList}. Open your order to see the latest details.`
            : `Your change request was applied: ${appliedList}. Open your order to see the latest details.`,
          priority: "normal",
          link: `/client-portal/my-orders?orderId=${(request as any).order_id}`,
          related_entity_type: "order",
          related_entity_id: (request as any).order_id,
        });
      }
    } catch (e) {
      console.warn("[amendment-review] approve notify failed:", e);
    }

    return res.status(200).json({
      ok: true,
      applied: Object.keys(toApply).length,
      applied_keys: Object.keys(toApply),
      inventory_recalc_queued: touchedInventory,
      cascade,
    });
  } catch (err: any) {
    console.error("[amendment-review] crashed:", err);
    return res.status(500).json({ error: err?.message || "Amendment review failed" });
  }
}
