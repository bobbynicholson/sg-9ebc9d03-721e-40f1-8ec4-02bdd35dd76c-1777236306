/**
 * POST /api/orders/[id]/driver-ack
 *
 * Driver confirms they've seen the assignment. Stamps
 * orders.driver_acknowledged_at + driver_acknowledged_via and fires
 * an in-app notification back to the company owner so admin can stop
 * chasing.
 *
 * Auth: caller must be the assigned_driver_id on this order, OR hold
 * an active driver_assignments row for it (dispatch-flow orders often
 * only have the assignment row, not orders.assigned_driver_id), OR be
 * a company admin marking the ack on the driver's behalf (e.g. radio
 * confirmation -> admin clicks "Ack on driver's behalf").
 *
 * Writes go through the service client AFTER the explicit authz check
 * above: the orders column-whitelist trigger only lets a driver write
 * driver_acknowledged_* when orders.assigned_driver_id/driver_id is
 * them, so an assignment-row-only driver acking through the session
 * client would be rejected at the DB even though they are the
 * legitimate driver for the job.
 *
 * Body: { via?: 'in_app' | 'whatsapp' | 'admin_marked' }  (default 'in_app')
 *
 * Idempotent: re-acking is a no-op (returns the existing timestamp).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const ALLOWED_VIA = new Set(["in_app", "whatsapp", "admin_marked"]);
// Mirrors the active-assignment window the driver dashboard loads.
const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "accepted", "en_route", "picked_up", "at_venue"];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    if (!orderId) return res.status(400).json({ error: "Order id required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    // Service client for the lookups + write. Authorization is
    // enforced explicitly below; nothing is returned before it passes.
    const service: any = getServiceSupabase();

    const { data: order, error: orderError } = await service
      .from("orders")
      .select("id, company_id, user_id, assigned_driver_id, driver_id, order_number, driver_acknowledged_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) {
      console.error("[driver-ack] order lookup failed:", orderError);
      return res.status(500).json({ error: dbErrorMessage(orderError) || "Could not load the order" });
    }
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Idempotent: already acked.
    if (order.driver_acknowledged_at) {
      return res.status(200).json({
        ok: true,
        alreadyAcked: true,
        acknowledged_at: order.driver_acknowledged_at,
      });
    }

    // Authz. The caller must be one of:
    //   1. the driver on the order row itself (assigned_driver_id or
    //      legacy driver_id),
    //   2. a driver with an active driver_assignments row for this
    //      order (dispatch-flow orders may never set the order column),
    //   3. an admin in the same company marking on the driver's behalf.
    const isAssignedDriver =
      order.assigned_driver_id === user.id || order.driver_id === user.id;

    let hasActiveAssignment = false;
    if (!isAssignedDriver) {
      const { data: assignment, error: assignmentError } = await service
        .from("driver_assignments")
        .select("id")
        .eq("order_id", orderId)
        .eq("driver_id", user.id)
        .in("status", ACTIVE_ASSIGNMENT_STATUSES)
        .limit(1)
        .maybeSingle();
      if (assignmentError) {
        console.error("[driver-ack] assignment lookup failed:", assignmentError);
        return res.status(500).json({ error: dbErrorMessage(assignmentError) || "Could not verify the assignment" });
      }
      hasActiveAssignment = !!assignment;
    }

    let isAdminOverride = false;
    if (!isAssignedDriver && !hasActiveAssignment) {
      const { data: profile } = await service
        .from("profiles")
        .select("role, active_role, company_id")
        .eq("id", user.id)
        .maybeSingle();
      const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
      isAdminOverride =
        ALLOWED_ADMIN_ROLES.has(role) &&
        (profile as any)?.company_id === order.company_id;
    }
    if (!isAssignedDriver && !hasActiveAssignment && !isAdminOverride) {
      return res.status(403).json({ error: "Only the assigned driver can acknowledge" });
    }

    const reqVia = String(req.body?.via || "").toLowerCase();
    const via = ALLOWED_VIA.has(reqVia)
      ? reqVia
      : (isAdminOverride ? "admin_marked" : "in_app");

    const stamp = new Date().toISOString();
    // Check the write actually landed. Pre-fix the result was
    // discarded, so a blocked/failed UPDATE still returned
    // { ok: true } and the admin chase-list showed acked orders
    // that were never acked.
    const { data: updatedRows, error: updateError } = await service
      .from("orders")
      .update({
        driver_acknowledged_at: stamp,
        driver_acknowledged_via: via,
      } as any)
      .eq("id", orderId)
      .select("id");
    if (updateError) {
      console.error("[driver-ack] update failed:", updateError);
      return res.status(500).json({ error: dbErrorMessage(updateError) || "Could not record the acknowledgement" });
    }
    if (!updatedRows || updatedRows.length === 0) {
      // Row vanished between the read and the write (deleted order).
      return res.status(500).json({ error: "Acknowledgement was not saved, please try again" });
    }

    // Notify the company owner / dispatch user.
    try {
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.createNotification({
        company_id: order.company_id,
        user_id: order.user_id,
        recipient_id: order.user_id,
        notification_type: "driver_acknowledged",
        title: "✅ Driver acknowledged",
        message: `Driver acked order ${order.order_number || orderId.slice(0, 8)}${isAdminOverride ? " (marked by admin)" : ""}.`,
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
    return res.status(500).json({ error: dbErrorMessage(err) || "Acknowledgement failed" });
  }
}

export default withApiLogging(handler);
