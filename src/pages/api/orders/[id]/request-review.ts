/* eslint-disable @typescript-eslint/no-explicit-any */
/** POST /api/orders/[id]/request-review - send this order's review email now. */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ADMIN_ROLES } from "@/lib/authGuards";
import { consumeApiKeyRateLimitDb, hashRateLimitIdentifier } from "@/lib/apiKeyRateLimit";
import { sendOrderReviewRequest } from "@/services/order/sendReviewRequest";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const orderId = String(req.query.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return res.status(400).json({ error: "Valid order id required." });

  try {
    const session = createPagesServerClient({ req, res });
    const { data: { user } } = await session.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in to send a review request." });
    const { data: profile } = await session
      .from("profiles")
      .select("role, company_id, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.is_active === false || profile.deleted_at || !ADMIN_ROLES.includes(profile.role as any)) {
      return res.status(403).json({ error: "An admin role is required to send a review request." });
    }

    const admin: any = getServiceSupabase();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, company_id, order_number, client_id, client_email, client_name, status, delivered_at, completed_at")
      .eq("id", orderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || (profile.role !== "super_admin" && profile.company_id !== order.company_id)) {
      return res.status(404).json({ error: "Order not found." });
    }

    const limit = await consumeApiKeyRateLimitDb(
      admin,
      hashRateLimitIdentifier(`manual-review-request:${orderId}:${user.id}`),
      { maxPerMinute: 3 },
    );
    if (!limit.allowed) return res.status(429).json({ error: "Please wait before sending another review request." });

    const { data: pending, error: pendingError } = await admin
      .from("pending_reviews")
      .select("id, sent_at, cancelled_at")
      .eq("order_id", orderId)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (pending?.sent_at) return res.status(200).json({ ok: true, already_sent: true });
    if (pending?.cancelled_at) return res.status(409).json({ error: "This review request was cancelled." });

    const queuedAt = new Date().toISOString();
    const { error: queueError } = await admin
      .from("pending_reviews")
      .upsert({
        company_id: order.company_id,
        order_id: orderId,
        client_id: order.client_id || null,
        client_email: order.client_email || null,
        client_name: order.client_name || null,
        delivered_at: order.delivered_at || order.completed_at || queuedAt,
        due_at: queuedAt,
      }, { onConflict: "order_id" });
    if (queueError) throw queueError;

    const result = await sendOrderReviewRequest(admin, orderId);
    if (!result.sent) {
      if (result.reason === "already_reviewed") {
        await admin.from("pending_reviews")
          .update({ sent_at: new Date().toISOString() })
          .eq("order_id", orderId)
          .is("sent_at", null);
        return res.status(200).json({ ok: true, already_reviewed: true });
      }
      if (result.reason === "already_sent") {
        await admin.from("pending_reviews")
          .update({ sent_at: new Date().toISOString() })
          .eq("order_id", orderId)
          .is("sent_at", null);
        return res.status(200).json({ ok: true, already_sent: true });
      }
      if (result.reason === "missing_email") {
        await admin.from("pending_reviews")
          .update({ sent_at: new Date().toISOString() })
          .eq("order_id", orderId)
          .is("sent_at", null);
        return res.status(409).json({ error: "This client has no email address on the order. A portal notification was sent if they have a linked account." });
      }
      if (result.reason === "settings_off") {
        return res.status(409).json({ skipped_by_settings: true, error: "The review request is queued, but this automatic email is turned off in Email settings." });
      }
      if (result.reason === "duplicate_recently_sent") {
        return res.status(409).json({ error: "A review email was sent very recently. The queued request will retry after the duplicate protection window." });
      }
      return res.status(409).json({ error: "Review requests can be sent after delivery." });
    }

    const { error: stampError } = await admin
      .from("pending_reviews")
      .update({ sent_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .is("sent_at", null);
    if (stampError) throw stampError;

    return res.status(200).json({ ok: true, sent: true });
  } catch (error: any) {
    console.error("[orders/request-review] failed:", error);
    return res.status(500).json({ error: "The review request could not be sent." });
  }
}

export default withApiLogging(handler);
