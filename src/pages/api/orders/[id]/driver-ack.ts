/**
 * POST /api/orders/[id]/driver-ack
 *
 * Driver confirms they've seen the assignment. Stamps
 * orders.driver_acknowledged_at + driver_acknowledged_via and fires
 * an in-app notification back to the company owner so admin can stop
 * chasing.
 *
 * Auth: caller must be the assigned_driver_id on this order, OR a
 * company admin marking the ack on the driver's behalf (e.g.
 * radio confirmation -> admin clicks "Ack on driver's behalf").
 *
 * Body: { via?: 'in_app' | 'whatsapp' | 'admin_marked' }  (default 'in_app')
 *
 * Idempotent: re-acking is a no-op (returns the existing timestamp).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";


const ALLOWED_ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const ALLOWED_VIA = new Set(["in_app", "whatsapp", "admin_marked"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    if (!orderId) return res.status(400).json({ error: "Order id required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, user_id, assigned_driver_id, order_number, driver_acknowledged_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Idempotent: already acked.
    if ((order as any).driver_acknowledged_at) {
      return res.status(200).json({
        ok: true,
        alreadyAcked: true,
        acknowledged_at: (order as any).driver_acknowledged_at,
      });
    }

    // Authz. Either the caller IS the assigned driver, or they're an
    // admin in the same company marking on the driver's behalf.
    const isAssignedDriver = (order as any).assigned_driver_id === user.id;
    let isAdminOverride = false;
    if (!isAssignedDriver) {
      const { data: profile } = await ssr
        .from("profiles")
        .select("role, active_role, company_id")
        .eq("id", user.id)
        .maybeSingle();
      const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
      isAdminOverride =
        ALLOWED_ADMIN_ROLES.has(role) &&
        (profile as any)?.company_id === (order as any).company_id;
    }
    if (!isAssignedDriver && !isAdminOverride) {
      return res.status(403).json({ error: "Only the assigned driver can acknowledge" });
    }

    const reqVia = String(req.body?.via || "").toLowerCase();
    const via = ALLOWED_VIA.has(reqVia)
      ? reqVia
      : (isAdminOverride ? "admin_marked" : "in_app");

    const stamp = new Date().toISOString();
    await ssr
      .from("orders")
      .update({
        driver_acknowledged_at: stamp,
        driver_acknowledged_via: via,
      } as any)
      .eq("id", orderId);

    // Notify the company owner / dispatch user.
    try {
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.createNotification({
        company_id: (order as any).company_id,
        user_id: (order as any).user_id,
        recipient_id: (order as any).user_id,
        notification_type: "driver_acknowledged",
        title: "✅ Driver acknowledged",
        message: `Driver acked order ${(order as any).order_number || orderId.slice(0, 8)}${isAdminOverride ? " (marked by admin)" : ""}.`,
        priority: "normal",
        link: `/admin/orders?orderId=${orderId}`,
        related_entity_type: "order",
        related_entity_id: orderId,
      } as any);
    } catch (e) {
      console.warn("[driver-ack] admin notify failed:", e);
    }

    return res.status(200).json({
      ok: true,
      acknowledged_at: stamp,
      via,
      adminOverride: isAdminOverride,
    });
  } catch (err: any) {
    console.error("[driver-ack] crashed:", err);
    return res.status(500).json({ error: err?.message || "Acknowledgement failed" });
  }
}

export default withApiLogging(handler);
