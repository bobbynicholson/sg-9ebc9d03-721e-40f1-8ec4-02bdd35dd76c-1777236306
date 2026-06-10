/**
 * POST /api/orders/regenerate-prep-tasks - Wave 70.9
 *
 * Manual trigger for kitchenPrepService.ensurePrepTasksForOrder
 * for a specific order. Two reasons this exists:
 *
 *   1. Recovery from the Wave 70.9 bug where same-day events were
 *      treated as "in the past" and silently skipped. Owner taps
 *      this from the order modal to retro-generate prep tasks for
 *      stuck orders.
 *
 *   2. Future-proof for the case where the auto-cascade fails
 *      mid-way (e.g. transient DB hiccup) and the chef needs a
 *      manual recover-now button.
 *
 * Body: { order_id: string, force?: boolean }
 *   - force=true soft-deletes any pending tasks first and re-plans
 *     against the current order state. Useful after a guest-count
 *     change.
 *
 * Auth: owner / company_admin / admin / super_admin in the same
 * company. Audit-logs the trigger.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const callerCompanyId = (profile as any)?.company_id as string | undefined;

    const { order_id, force } = (req.body || {}) as { order_id?: string; force?: boolean };
    if (!order_id) return res.status(400).json({ error: "order_id required" });

    const admin: any = getServiceSupabase();

    const { data: order } = await admin
      .from("orders")
      .select("id, company_id, event_date, event_time, status")
      .eq("id", order_id)
      .maybeSingle();
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (role !== "super_admin" && callerCompanyId && callerCompanyId !== (order as any).company_id) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Wave 70.11 - manual operator-initiated regen always uses
    // force=true. That:
    //   - bypasses the past-date guard (so an admin can backfill
    //     prep tasks for a historical order, e.g. seed data)
    //   - soft-deletes existing pending tasks and re-plans against
    //     the current order state (so a guest-count or menu change
    //     gets picked up)
    // Auto-cascade calls (postCreationCascade, amendment-review,
    // etc) keep their own force flag for their own reasons.
    const effectiveForce = force === undefined ? true : !!force;

    // Run the regen via the service-role client so RLS doesn't block
    // the insert (the helper falls back to the browser anon client
    // by default).
    const result = await kitchenPrepService.ensurePrepTasksForOrder(
      (order as any).company_id,
      order_id,
      user.id,
      admin,
      { force: effectiveForce },
    );

    try {
      await admin.from("audit_logs").insert({
        company_id: (order as any).company_id,
        user_id: user.id,
        action: "prep_tasks_regenerated",
        entity_type: "order",
        entity_id: order_id,
        details: {
          created: result.created,
          skippedReason: result.skippedReason || null,
          force: effectiveForce,
          event_date: (order as any).event_date,
          event_time: (order as any).event_time,
        },
      });
    } catch (auditErr) {
      console.warn("[orders/regenerate-prep-tasks] audit insert failed:", auditErr);
    }

    // Wave 70.11 - precise per-reason message so the operator
    // knows WHY no tasks were generated instead of getting the
    // generic "may have X, Y, or Z" fallback.
    let message: string;
    if (result.created > 0) {
      message = `Generated ${result.created} prep task${result.created === 1 ? "" : "s"}. Refresh the kitchen production page to see them.`;
    } else {
      switch (result.skippedReason) {
        case "auto_generate_disabled":
          message = "Auto-generate prep tasks is turned off for this tenant. Switch it on under /admin/kitchen-settings and try again.";
          break;
        case "import_quarantine":
          message = "Order is in import quarantine (imported from a prior system). Quarantine clears automatically; manual override available via the order's pause/imported flags.";
          break;
        case "comms_paused":
          message = "Order has communications paused. Resume comms on the order before regenerating prep.";
          break;
        case "event_in_past":
          message = "Event is in the past. Manual regen normally bypasses this; if you're seeing this message the force flag was overridden - contact support.";
          break;
        case "already_has_pending_tasks":
          message = "Order already has pending prep tasks. Open Production to see them, or pass force=true to wipe and replan.";
          break;
        case "no_menu_items_or_no_pickup_time":
          message = "Could not plan tasks. Either the order has no menu items, the menu items have no name field, or there's no pickup_time / event_time / event_date set.";
          break;
        default:
          if (result.skippedReason?.startsWith("insert_failed:")) {
            message = `Insert failed: ${result.skippedReason.slice("insert_failed:".length)}`;
          } else {
            message = `No tasks generated${result.skippedReason ? ` (${result.skippedReason})` : ""}.`;
          }
      }
    }

    return res.status(200).json({
      ok: true,
      created: result.created,
      skippedReason: result.skippedReason || null,
      message,
    });
  } catch (err: any) {
    console.error("[orders/regenerate-prep-tasks] crashed:", err);
    return res.status(500).json({ error: err?.message || "Regenerate crashed" });
  }
}

export default withApiLogging(handler);
