/**
 * POST /api/orders/[id]/eta-change
 *
 * DRV-G (driver deep audit, DRV-33): one-tap "I'm running late"
 * broadcast. Driver stuck in Joburg traffic hits "Running late
 * 15 / 30 / 60 min" on the dashboard - the endpoint:
 *
 *   1. Authz: caller must be the assigned_driver_id (or an admin
 *      marking on the driver's behalf via radio).
 *   2. Notifies the company owner / dispatch user with the delay
 *      minutes baked into the message.
 *   3. Notifies the client (if the order has a linked client_id)
 *      so they know their food's running late before the driver
 *      arrives.
 *
 * No schema change required for v1 - persistence is via the
 * notification record. A follow-up migration can add a structured
 * `orders.driver_eta_delay_minutes` column if Bobby wants the chip
 * to survive a refresh.
 *
 * Body: { delay_minutes: 15 | 30 | 60, reason?: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const ALLOWED_DELAY_MINUTES = new Set([15, 30, 60]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    if (!orderId) return res.status(400).json({ error: "Order id required" });

    const delayMinutes = Number(req.body?.delay_minutes);
    if (!ALLOWED_DELAY_MINUTES.has(delayMinutes)) {
      return res.status(400).json({ error: "delay_minutes must be 15, 30, or 60" });
    }
    const reason = typeof req.body?.reason === "string"
      ? String(req.body.reason).slice(0, 280)
      : null;

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: order } = await ssr
      .from("orders")
      .select("id, company_id, user_id, client_id, assigned_driver_id, order_number, client_name, event_time")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Authz - assigned driver OR admin override.
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
      return res.status(403).json({ error: "Only the assigned driver can broadcast ETA changes" });
    }

    const { notificationService } = await import("@/services/notificationService");
    const orderLabel = (order as any).order_number || orderId.slice(0, 8);
    const clientLabel = (order as any).client_name || "the client";
    const reasonSuffix = reason ? ` Reason: ${reason}` : "";

    // 1. Notify admin / dispatch.
    try {
      await notificationService.createNotification({
        company_id: (order as any).company_id,
        user_id: (order as any).user_id,
        recipient_id: (order as any).user_id,
        notification_type: "driver_running_late",
        title: `⏱ Driver running ${delayMinutes}m late`,
        message: `Order ${orderLabel} - ${clientLabel}: driver flagged a ${delayMinutes}-minute delay.${reasonSuffix}`,
        priority: delayMinutes >= 30 ? "high" : "normal",
        link: `/admin/order-assignments?orderId=${orderId}`,
        related_entity_type: "order",
        related_entity_id: orderId,
      } as any);
    } catch (e) {
      console.warn("[eta-change] admin notify failed:", e);
    }

    // 2. Notify the client (if there is a linked client account).
    //    NOTE: orders.client_id is a FK to clients.id, NOT an auth user id.
    //    notifications.recipient_id must be an auth user id (RLS filters on
    //    it), so resolve the real auth uid first - otherwise the row inserts
    //    against a clients.id that no auth user matches and the client never
    //    sees it. Mirrors orderWorkflow.sendStatusNotifications.
    let notifiedClient = false;
    if ((order as any).client_id) {
      try {
        const { resolveClientUserId } = await import("@/services/lifecycle/resolveClientUserId");
        const clientAuthUid = await resolveClientUserId(ssr, (order as any).client_id);
        if (clientAuthUid) {
          await notificationService.createNotification({
            company_id: (order as any).company_id,
            user_id: clientAuthUid,
            recipient_id: clientAuthUid,
            notification_type: "delivery_eta_changed",
            title: `Update on your delivery`,
            message: `Your driver is running ~${delayMinutes} minutes late for order ${orderLabel}. They're on the way.`,
            priority: "normal",
            link: `/client-portal/tracking`,
            related_entity_type: "order",
            related_entity_id: orderId,
          } as any);
          notifiedClient = true;
        } else {
          console.warn(`[eta-change] no auth uid for client_id=${(order as any).client_id}; skipping client notify`);
        }
      } catch (e) {
        console.warn("[eta-change] client notify failed:", e);
      }
    }

    return res.status(200).json({
      ok: true,
      orderId,
      delay_minutes: delayMinutes,
      notified_admin: true,
      notified_client: notifiedClient,
      adminOverride: isAdminOverride,
    });
  } catch (err: any) {
    console.error("[eta-change] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "ETA broadcast failed" });
  }
}

export default withApiLogging(handler);
