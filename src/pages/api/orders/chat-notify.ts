import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getRequestSupabase } from "@/lib/supabase/service";
import { notificationService } from "@/services/notificationService";

const STAFF_ROLES = [
  "owner",
  "company_admin",
  "admin",
  "super_admin",
  "region_admin",
  "sales_admin",
  "kitchen_manager",
  "kitchen_staff",
  "shopping_manager",
  "shopping_staff",
  "cleaning_manager",
  "cleaning_staff",
  "waiter",
  "driver",
] as any;

function preview(body: string): string {
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}

/**
 * Deliver in-app notifications for an already-persisted order chat message.
 * The chat row is written by the authenticated browser session; fan-out is
 * deliberately server-side so a client cannot enumerate staff profiles or
 * select notification recipients itself.
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
    .from("order_chat_messages")
    .select("id, order_id, company_id, sender_id, sender_role, body")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError || !message) return res.status(404).json({ error: "Chat message not found." });
  if (message.sender_id !== user.id) return res.status(403).json({ error: "You can only notify from your own message." });

  let db: any;
  try {
    db = await getRequestSupabase();
  } catch (error) {
    console.error("[chat-notify] service client unavailable", error);
    return res.status(503).json({ error: "Notification service is not configured." });
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, company_id, order_number, event_name, client_id")
    .eq("id", message.order_id)
    .maybeSingle();
  if (orderError || !order || order.company_id !== message.company_id) {
    return res.status(404).json({ error: "Order context could not be resolved." });
  }

  const orderRef = order.event_name || order.order_number || "your order";
  const messageText = preview(String(message.body || ""));

  if (message.sender_role === "client") {
    const notified = await notificationService.broadcastNotification({
      companyId: order.company_id,
      type: "order_message",
      title: `Client message - ${orderRef}`,
      message: messageText,
      targetRoles: STAFF_ROLES,
      priority: "high",
      link: `/admin/orders?orderId=${encodeURIComponent(order.id)}&tab=messages`,
      relatedEntityType: "order",
      relatedEntityId: order.id,
    }, db);
    return res.status(200).json({ notified });
  }

  if (!order.client_id) return res.status(200).json({ notified: 0 });
  const { data: client } = await db
    .from("clients")
    .select("user_id, email")
    .eq("id", order.client_id)
    .maybeSingle();
  let clientUserId = client?.user_id || null;
  if (!clientUserId && client?.email) {
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .ilike("email", String(client.email).trim())
      .maybeSingle();
    clientUserId = profile?.id || null;
  }
  if (!clientUserId) return res.status(200).json({ notified: 0 });

  const notification = await notificationService.createNotification({
    company_id: order.company_id,
    recipient_id: clientUserId,
    notification_type: "order_message",
    title: `New message about ${orderRef}`,
    message: messageText,
    priority: "normal",
    related_entity_type: "order",
    related_entity_id: order.id,
    link: `/client-portal/dashboard?chatOrderId=${encodeURIComponent(order.id)}`,
  }, db);
  return res.status(200).json({ notified: notification ? 1 : 0 });
}
