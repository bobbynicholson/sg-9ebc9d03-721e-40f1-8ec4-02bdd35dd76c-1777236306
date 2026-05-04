/**
 * POST /api/orders/[id]/resume
 *
 * Reverses a pause. Restores the order to whichever status it was
 * paused from (typically 'confirmed'), un-pauses queued emails, and
 * restores soft-deleted kitchen prep tasks. The order's audit log
 * gets a "resumed from paused" entry so the trail is complete.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { resumeOrder } from "@/services/order/orderWorkflow";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    if ((order as any).status !== "paused") {
      return res.status(409).json({ error: "Order is not paused" });
    }

    const result = await resumeOrder(orderId, {
      resumed_by_user_id: user.id,
      client: ssr,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.status(200).json({ ok: true, order: result.data });
  } catch (e: any) {
    console.error("/api/orders/[id]/resume crashed:", e);
    return res.status(500).json({ error: e?.message || "Resume failed" });
  }
}
