/**
 * POST /api/orders/[id]/pause
 *
 * Admin-side order pause. The client phoned to say "we might still go
 * ahead, hold tight" - different from cancel because the trajectory
 * is alive. Suspends the order's email reminders + kitchen prep tasks
 * in place so resume restores them without losing history.
 *
 *   1. Auth: admin/owner of the order's company.
 *   2. Validate reason_category against the allow-list.
 *   3. Run pauseOrder() workflow (status flip + cascades + audit +
 *      notifications fan-out).
 *
 * Body:
 *   {
 *     reason_category: 'client_pause'|'awaiting_headcount'|'venue_change'|
 *                       'date_change'|'awaiting_payment'|'other',
 *     reason?: string,
 *     expected_resume_date?: string (YYYY-MM-DD)
 *   }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { pauseOrder } from "@/services/order/orderWorkflow";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const VALID_CATEGORIES = new Set([
  "client_pause",
  "awaiting_headcount",
  "venue_change",
  "date_change",
  "awaiting_payment",
  "other",
]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    if (!orderId) return res.status(400).json({ error: "Order id is required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) {
      return res.status(403).json({ error: "Admin or owner only" });
    }

    const body = (req.body || {}) as any;
    const reason_category = String(body.reason_category || "other");
    const reason = body.reason ? String(body.reason) : null;
    const expected_resume_date = body.expected_resume_date ? String(body.expected_resume_date) : null;

    if (!VALID_CATEGORIES.has(reason_category)) {
      return res.status(400).json({ error: "Invalid reason_category" });
    }

    // Read the order + tenant scope check.
    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, status, deleted_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || (order as any).deleted_at) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (
      role !== "super_admin" &&
      (profile as any)?.company_id !== (order as any).company_id
    ) {
      return res.status(403).json({ error: "Wrong company" });
    }
    if ((order as any).status === "paused") {
      return res.status(409).json({ error: "Order is already paused" });
    }
    if ((order as any).status === "cancelled" || (order as any).status === "completed") {
      return res.status(409).json({ error: `Cannot pause a ${(order as any).status} order` });
    }

    const result = await pauseOrder(orderId, {
      reason: reason || undefined,
      reason_category,
      paused_by_user_id: user.id,
      expected_resume_date,
      client: ssr,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.status(200).json({ ok: true, order: result.data });
  } catch (e: any) {
    console.error("/api/orders/[id]/pause crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Pause failed" });
  }
}

export default withApiLogging(handler);
