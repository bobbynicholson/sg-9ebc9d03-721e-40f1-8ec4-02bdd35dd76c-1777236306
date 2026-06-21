/**
 * POST /api/orders/[id]/assign-secondary-driver   { driverId }
 *
 * Assigns the SECONDARY driver on a two-driver job and notifies that
 * driver. Runs server-side under service role for the writes so the
 * cross-user notification insert is reliable (a browser-side insert for
 * another user is subject to RLS and was silently not landing).
 *
 * Auth: caller must be a company admin/owner on the order's company.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

const ALLOWED_ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner", "region_admin", "sales_admin"]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const orderId = String(req.query.id || "");
    const driverId = typeof req.body?.driverId === "string" ? req.body.driverId : "";
    if (!orderId || !driverId) return res.status(400).json({ error: "Order id and driverId required" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const admin = getServiceSupabase();

    const { data: order } = await admin
      .from("orders")
      .select("id, company_id, order_number, assigned_driver_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Authz: caller must be an admin in the order's company.
    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    const isAdmin = ALLOWED_ADMIN_ROLES.has(role) && (profile as any)?.company_id === (order as any).company_id;
    if (!isAdmin) return res.status(403).json({ error: "Only an admin can assign the secondary driver" });

    if (driverId === (order as any).assigned_driver_id) {
      return res.status(400).json({ error: "That driver is already the primary on this order." });
    }

    // The chosen driver must be a driver in the same company.
    const { data: driver } = await admin
      .from("profiles")
      .select("id, full_name, role, company_id")
      .eq("id", driverId)
      .maybeSingle();
    if (!driver || (driver as any).company_id !== (order as any).company_id || (driver as any).role !== "driver") {
      return res.status(400).json({ error: "Not a valid driver for this company" });
    }

    const { error: updErr } = await admin
      .from("orders")
      .update({ secondary_driver_id: driverId, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    if (updErr) {
      return res.status(500).json({ error: dbErrorMessage(updErr) || "Could not assign secondary driver" });
    }

    // Notify the secondary driver (service role -> reliable cross-user insert).
    try {
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.createNotification(
        {
          company_id: (order as any).company_id,
          user_id: driverId,
          recipient_id: driverId,
          notification_type: "driver_assigned",
          title: "Secondary delivery assignment",
          message: `You're the second driver on order ${(order as any).order_number || orderId.slice(0, 8)}. Open Deliveries for the details.`,
          priority: "high",
          link: "/team-portal/driver/deliveries",
          related_entity_type: "order",
          related_entity_id: orderId,
        } as any,
        admin,
      );
    } catch (notifyErr) {
      console.warn("[assign-secondary-driver] notify failed:", notifyErr);
    }

    return res.status(200).json({
      ok: true,
      driver: { id: (driver as any).id, full_name: (driver as any).full_name },
    });
  } catch (err: any) {
    console.error("[assign-secondary-driver] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Assignment failed" });
  }
}

export default withApiLogging(handler);
