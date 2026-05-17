/**
 * POST /api/orders/regenerate-prep-tasks -- Wave 70.9
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

    // Run the regen via the service-role client so RLS doesn't block
    // the insert (the helper falls back to the browser anon client
    // by default).
    const result = await kitchenPrepService.ensurePrepTasksForOrder(
      (order as any).company_id,
      order_id,
      user.id,
      admin,
      { force: !!force },
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
          force: !!force,
          event_date: (order as any).event_date,
          event_time: (order as any).event_time,
        },
      });
    } catch (auditErr) {
      console.warn("[orders/regenerate-prep-tasks] audit insert failed:", auditErr);
    }

    return res.status(200).json({
      ok: true,
      created: result.created,
      message: result.created > 0
        ? `Generated ${result.created} prep task${result.created === 1 ? "" : "s"}. Refresh the kitchen production page to see them.`
        : "No tasks generated. The order may have no menu items, already have pending tasks, or be in import quarantine.",
    });
  } catch (err: any) {
    console.error("[orders/regenerate-prep-tasks] crashed:", err);
    return res.status(500).json({ error: err?.message || "Regenerate crashed" });
  }
}
