/**
 * POST /api/orders/amendment-cascade-retry
 *
 * Retry endpoint for failed amendment cascades. Phase 1 P0-08 made
 * amendment-review.ts await its three cascades (kitchen prep regen /
 * invoice refresh / inventory recalc) and persist the per-step outcome
 * to order_amendment_requests.applied_snapshot.cascade. This endpoint
 * reads that snapshot and re-runs only the steps that previously
 * failed, so the operator can recover from a partial cascade without
 * starting over.
 *
 * Body: { request_id: string, force?: boolean }
 *   - force=true re-runs every step regardless of prior outcome.
 *
 * Auth: company_admin / admin / owner / super_admin in the same
 * company as the request. [P2F-6]
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

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

    const { request_id, force } = (req.body || {}) as { request_id?: string; force?: boolean };
    if (!request_id) return res.status(400).json({ error: "request_id required" });

    const { data: request } = await ssr
      .from("order_amendment_requests")
      .select("id, order_id, company_id, status, applied_snapshot")
      .eq("id", request_id)
      .maybeSingle();

    if (!request) return res.status(404).json({ error: "Amendment request not found" });
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (request as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }
    if ((request as any).status !== "approved") {
      return res.status(409).json({
        error: `Can only retry cascades for approved amendments. Current status: ${(request as any).status}.`,
      });
    }

    const snapshot = (request as any).applied_snapshot || {};
    const prior = (snapshot.cascade || {}) as {
      kitchen_prep?: { ok: boolean; reason?: string };
      invoice?: { ok: boolean; reason?: string };
      inventory?: { ok: boolean; reason?: string; skipped?: boolean };
    };

    const cascade: typeof prior = {
      kitchen_prep: prior.kitchen_prep || { ok: false },
      invoice: prior.invoice || { ok: false },
      inventory: prior.inventory || { ok: false, skipped: true },
    };

    const orderId = (request as any).order_id;
    const companyId = (request as any).company_id;

    // Step 1: kitchen prep regen (skip if previously ok and not forced).
    if (force || !prior.kitchen_prep?.ok) {
      try {
        const { kitchenPrepService } = await import("@/services/kitchenPrepService");
        await (kitchenPrepService as any).ensurePrepTasksForOrder(companyId, orderId);
        cascade.kitchen_prep = { ok: true };
      } catch (e: any) {
        cascade.kitchen_prep = { ok: false, reason: e?.message || "kitchen prep regen failed" };
      }
    }

    // Step 2: invoice refresh.
    if (force || !prior.invoice?.ok) {
      try {
        const { ensureInvoiceForOrder } = await import("@/services/invoiceGenerationService");
        await ensureInvoiceForOrder(orderId, companyId);
        cascade.invoice = { ok: true };
      } catch (e: any) {
        cascade.invoice = { ok: false, reason: e?.message || "invoice refresh failed" };
      }
    }

    // Step 3: inventory recalc - only if the step was previously
    // attempted (not skipped) AND is forced or failed.
    const inventoryAttempted = prior.inventory && prior.inventory.skipped !== true;
    if (inventoryAttempted && (force || !prior.inventory?.ok)) {
      try {
        const { recalculateInventoryForOrder } = await import("@/services/inventoryDeductionService");
        const result = await recalculateInventoryForOrder(orderId, companyId, user.id);
        cascade.inventory = { ok: !!result.success, skipped: false };
        if (!result.success) {
          cascade.inventory.reason = (result.errors || []).join("; ") || "inventory recalc errors";
        }
      } catch (e: any) {
        cascade.inventory = { ok: false, skipped: false, reason: e?.message || "inventory recalc crashed" };
      }
    }

    // Persist updated cascade outcome on the request row.
    await ssr.from("order_amendment_requests").update({
      applied_snapshot: { ...snapshot, cascade, retried_at: new Date().toISOString(), retried_by: user.id },
    } as any).eq("id", request_id);

    const allOk = cascade.kitchen_prep?.ok
      && cascade.invoice?.ok
      && (cascade.inventory?.ok || cascade.inventory?.skipped === true);

    return res.status(200).json({
      ok: true,
      cascade,
      all_steps_succeeded: allOk,
    });
  } catch (err: any) {
    console.error("[amendment-cascade-retry] crashed:", err);
    return res.status(500).json({ error: err?.message || "Cascade retry failed" });
  }
}
