/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/client-tokens/submit-feedback
 *
 * Submit a rating from the order-specific client magic-link page. The
 * per-order token cookie is verified through the same client_view_order
 * RPC that protects the rest of /c/order/[id].
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitDb, hashRateLimitIdentifier } from "@/lib/apiKeyRateLimit";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const orderId = String(body.order_id || "").trim();
    const rating = Number(body.overall_rating);
    const comments = typeof body.comments === "string" ? body.comments.trim().slice(0, 2000) : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return res.status(400).json({ error: "Valid order_id required" });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Choose a rating from 1 to 5 stars." });
    }

    const tokenHash = (
      req.cookies?.[`cms_client_token_${orderId}`]
      || req.cookies?.cms_client_account_token
      || ""
    ).trim();
    if (!tokenHash) return res.status(401).json({ error: "Open the secure order link from your email first." });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return res.status(500).json({ error: "Server misconfigured" });
    const client = createClient(url, anon, { auth: { persistSession: false } });
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || (req.socket as any)?.remoteAddress || "unknown";
    const ua = (req.headers["user-agent"] as string) || null;
    const { data: view, error: tokenError } = await client.rpc("client_view_order", {
      p_token_hash: tokenHash,
      p_order_id: orderId,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (tokenError) throw tokenError;
    if (!(view as any)?.ok) return res.status(401).json({ error: "This secure order link has expired." });

    const admin: any = getServiceSupabase();
    const limit = await consumeApiKeyRateLimitDb(
      admin,
      hashRateLimitIdentifier(`order-review:${orderId}:${ip}`),
      { maxPerMinute: 5 },
    );
    if (!limit.allowed) return res.status(429).json({ error: "Please wait a moment before trying again." });

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, company_id, client_id, client_email, status, delivered_at, completed_at")
      .eq("id", orderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (!(order.delivered_at || order.completed_at || ["delivered", "completed"].includes(String(order.status || "").toLowerCase()))) {
      return res.status(409).json({ error: "Ratings open after the event has been delivered." });
    }

    let clientId = order.client_id as string | null;
    if (!clientId && order.client_email) {
      const { data: matchedClient } = await admin
        .from("clients")
        .select("id")
        .eq("company_id", order.company_id)
        .ilike("email", String(order.client_email).trim())
        .maybeSingle();
      clientId = matchedClient?.id || null;
    }
    if (!clientId) return res.status(409).json({ error: "The catering team needs to link this booking to its client record before it can be rated." });

    const { data: existing, error: existingError } = await admin
      .from("delivery_feedback")
      .select("id")
      .eq("order_id", orderId)
      .eq("company_id", order.company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) {
      return res.status(200).json({ ok: true, already_submitted: true });
    }

    const { error: insertError } = await admin.from("delivery_feedback").insert({
      company_id: order.company_id,
      order_id: orderId,
      client_id: clientId,
      overall_rating: rating,
      comments: comments || null,
    });
    if (insertError) throw insertError;
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("[client-tokens/submit-feedback] failed:", error);
    return res.status(500).json({ error: "We couldn't save your rating. Please try again." });
  }
}

export default withApiLogging(handler);
