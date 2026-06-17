/**
 * POST /api/admin/outsource-assignments/[id]/action
 *
 * Wave 67 Phase D - admin actions on an existing assignment.
 * Single endpoint, switch by body.action. Cleaner than a separate
 * route per verb when each verb is a small state flip.
 *
 * Body: { action: 'mark_accepted' | 'cancel' | 'set_status' | 'update_cost',
 *         status?: string, quotedCost?: number, reason?: string }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ROLES = new Set([
  "super_admin", "company_admin", "owner", "admin", "sales_admin", "region_admin",
]);
const ALLOWED_STATUSES = new Set([
  "requested", "accepted", "declined", "en_route", "on_site", "completed", "cancelled",
]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const assignmentId = typeof req.query.id === "string" ? req.query.id : null;
    if (!assignmentId) return res.status(400).json({ error: "Assignment id required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const body = (req.body || {}) as any;
    const action = body.action as string;

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Tenant scope check.
    const { data: existing } = await admin
      .from("outsource_assignments")
      .select("id, company_id, status")
      .eq("id", assignmentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Assignment not found in your company" });

    const nowIso = new Date().toISOString();
    let patch: any = {};
    let auditAction = "outsource_assignment_action";

    switch (action) {
      case "mark_accepted":
        patch = {
          status: "accepted",
          responded_at: nowIso,
          manually_marked_accepted: true,
          manually_marked_by: user.id,
        };
        auditAction = "outsource_marked_accepted_manual";
        break;
      case "cancel":
        patch = {
          status: "cancelled",
          cancelled_at: nowIso,
          decline_reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null,
        };
        auditAction = "outsource_cancelled";
        break;
      case "set_status": {
        const nextStatus = body.status as string;
        if (!ALLOWED_STATUSES.has(nextStatus)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        patch = { status: nextStatus };
        if (nextStatus === "en_route") patch.en_route_at = nowIso;
        if (nextStatus === "on_site") patch.on_site_at = nowIso;
        if (nextStatus === "completed") patch.completed_at = nowIso;
        if (nextStatus === "accepted") patch.responded_at = nowIso;
        auditAction = `outsource_status_${nextStatus}`;
        break;
      }
      case "update_cost": {
        const cost = Number(body.quotedCost);
        if (!Number.isFinite(cost) || cost < 0) {
          return res.status(400).json({ error: "quotedCost must be a non-negative number" });
        }
        patch = { quoted_cost: Number(cost.toFixed(2)) };
        auditAction = "outsource_cost_updated";
        break;
      }
      case "set_routing_group": {
        // Wave 67.5 - join this assignment to an existing routing
        // group (or start one). Used by the panel's "Add candidate"
        // flow to promote a single into a multi-provider group when
        // the first candidate is added.
        const rgid = typeof body.routingGroupId === "string" ? body.routingGroupId : null;
        if (rgid && !/^[0-9a-f-]{36}$/i.test(rgid)) {
          return res.status(400).json({ error: "Invalid routing group id" });
        }
        patch = { routing_group_id: rgid };
        auditAction = "outsource_routing_group_set";
        break;
      }
      default:
        return res.status(400).json({ error: "Unknown action" });
    }

    const { error: updErr } = await admin
      .from("outsource_assignments")
      .update(patch)
      .eq("id", assignmentId);
    if (updErr) {
      console.error("[admin/outsource-assignments/action] update failed:", updErr);
      return res.status(500).json({ error: dbErrorMessage(updErr) });
    }

    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: auditAction,
        entity_type: "outsource_assignment",
        entity_id: assignmentId,
        details: { action, previous_status: (existing as any).status, ...patch },
      });
    } catch (auditErr) {
      console.warn("[admin/outsource-assignments/action] audit failed:", auditErr);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[admin/outsource-assignments/action] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Action failed" });
  }
}

export default withApiLogging(handler);
