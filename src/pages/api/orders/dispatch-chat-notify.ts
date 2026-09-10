import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getRequestSupabase } from "@/lib/supabase/service";
import { notificationService } from "@/services/notificationService";

const ADMIN_ROLES = [
  "owner", "company_admin", "admin", "super_admin", "region_admin", "sales_admin",
] as any;

function preview(body: string): string {
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}

/**
 * Deliver an in-app admin alert for a dispatch chat message. The message
 * must already exist and the authenticated caller must be its sender.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST is supported." });
  }

  const sessionDb = createPagesServerClient({ req, res }) as any;
  const { data: { user } } = await sessionDb.auth.getUser();
  if (!user) return res.status(401).json({ error: "Please sign in before sending notifications." });

  const messageId = String(req.body?.messageId || "").trim();
  if (!messageId) return res.status(400).json({ error: "messageId is required." });

  const { data: message, error: messageError } = await sessionDb
    .from("dispatch_messages")
    .select("id, order_id, company_id, sender_id, sender_role, body")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError || !message) return res.status(404).json({ error: "Dispatch message not found." });
  if (message.sender_id !== user.id) return res.status(403).json({ error: "You can only notify from your own message." });

  const db = await getRequestSupabase() as any;
  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, company_id, order_number, event_name")
    .eq("id", message.order_id)
    .maybeSingle();
  if (orderError || !order || order.company_id !== message.company_id) {
    return res.status(404).json({ error: "Order context could not be resolved." });
  }

  const orderRef = order.event_name || order.order_number || "an order";
  const notified = await notificationService.broadcastNotification({
    companyId: order.company_id,
    type: "order_message",
    title: `Dispatch message - ${orderRef}`,
    message: preview(String(message.body || "")),
    targetRoles: ADMIN_ROLES,
    priority: message.sender_role === "driver" ? "high" : "normal",
    link: `/admin/orders?orderId=${encodeURIComponent(order.id)}`,
    relatedEntityType: "order",
    relatedEntityId: order.id,
    dedup: false,
  }, db);

  return res.status(200).json({ notified });
}
