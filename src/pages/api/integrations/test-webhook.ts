/**
 * Fires a test payload at a webhook subscription so the catering company
 * can verify their Zapier "Catch Hook" actually receives data. We sign
 * the request the same way real events do so they can also confirm
 * their HMAC verification works.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { requireActiveApiProfile } from "@/lib/requireActiveApiProfile";
import { getServiceSupabase } from "@/lib/supabase/service";
import { parsePublicWebhookUrl } from "@/lib/webhooks/validateTargetUrl";
import { withApiLogging } from "@/lib/withApiLogging";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const actor = await requireActiveApiProfile(req, res, new Set(["super_admin", "company_admin", "admin", "owner"]));
  if (!actor) return;
  const companyId = actor.profile.company_id;
  if (!companyId) return res.status(403).json({ error: "Company access required" });

  const subscriptionId = String(req.body?.subscription_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(subscriptionId)) return res.status(400).json({ error: "Missing or invalid webhook ID" });

  const admin = getServiceSupabase();
  const { data: sub, error: subErr } = await admin
    .from("webhook_subscriptions")
    .select("id, company_id, event_type, target_url, signing_secret, failure_count")
    .eq("id", subscriptionId)
    .eq("company_id", companyId)
    .single();
  if (subErr || !sub) return res.status(404).json({ error: "Webhook not found" });

  const target = parsePublicWebhookUrl(String(sub.target_url || ""));
  if (!target) return res.status(400).json({ error: "Webhook target must be a public HTTPS URL" });

  // Build a representative sample payload for the event type
  const sample = buildSample(sub.event_type);
  const body = {
    event: sub.event_type,
    company_id: sub.company_id,
    fired_at: new Date().toISOString(),
    test: true,
    data: sample,
  };
  const bodyText = JSON.stringify(body);
  const signature = crypto
    .createHmac("sha256", sub.signing_secret)
    .update(bodyText)
    .digest("hex");

  let status_code: number | null = null;
  let response_body = "";
  let error_message: string | null = null;
  try {
    const r = await fetch(target.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "CateringMS-Webhooks/1.0",
        "X-Cms-Event": sub.event_type,
        "X-Cms-Signature": signature,
        "X-Cms-Test": "true",
      },
      body: bodyText,
      redirect: "manual",
    });
    status_code = r.status;
    response_body = await r.text();
  } catch (e: any) {
    error_message = dbErrorMessage(e) || "Network error";
  }

  await admin.from("webhook_deliveries").insert({
    subscription_id: sub.id,
    company_id: sub.company_id,
    event_type: sub.event_type,
    payload: body,
    status_code,
    response_body: response_body.slice(0, 1000),
    error_message,
  });

  await admin
    .from("webhook_subscriptions")
    .update({
      last_fired_at: new Date().toISOString(),
      last_status: status_code,
      failure_count: error_message ? Number(sub.failure_count || 0) + 1 : Number(sub.failure_count || 0),
    })
    .eq("id", sub.id)
    .eq("company_id", companyId);

  if (error_message) return res.status(502).json({ error: error_message });
  return res.status(200).json({ status_code, response_body });
}

function buildSample(event: string) {
  switch (event) {
    case "lead.created":
      return {
        id: "00000000-0000-0000-0000-000000000001",
        contact_name: "Sample Lead",
        email: "lead@example.com",
        phone: "+27 82 555 0100",
        event_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        guest_count: 80,
        budget_range: "R40,000 - R60,000",
        venue_address: "Johannesburg",
        source: "test_webhook",
        notes: "This is a test event from CateringMS",
      };
    case "quote.sent":
    case "quote.accepted":
      return {
        id: "00000000-0000-0000-0000-000000000002",
        quote_number: "QUO-TEST-001",
        client_name: "Sample Client",
        client_email: "client@example.com",
        total_amount: 45000,
        status: event === "quote.accepted" ? "accepted" : "sent",
      };
    case "order.created":
    case "order.status_changed":
      return {
        order: {
          id: "00000000-0000-0000-0000-000000000003",
          order_number: "ORD-TEST-001",
          client_name: "Sample Client",
          event_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          guest_count: 60,
          total_amount: 60000,
          status: event === "order.status_changed" ? "preparing" : "confirmed",
        },
        previous_status: event === "order.status_changed" ? "confirmed" : null,
        new_status:      event === "order.status_changed" ? "preparing" : "confirmed",
      };
    case "inventory.low_stock":
      return {
        item_name: "Lamb Leg (whole)",
        current_stock: 5,
        minimum_stock: 15,
        unit_of_measure: "kg",
        upcoming_demand_kg: 24,
      };
    default:
      return { note: "Sample payload" };
  }
}

export default withApiLogging(handler);
