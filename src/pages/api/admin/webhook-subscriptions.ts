import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireActiveApiProfile } from "@/lib/requireActiveApiProfile";
import { getServiceSupabase } from "@/lib/supabase/service";
import { parsePublicWebhookUrl } from "@/lib/webhooks/validateTargetUrl";
import { withApiRequestLogging } from "@/lib/withApiLogging";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const EVENT_TYPES = new Set([
  "lead.created", "lead.status_changed", "quote.created", "quote.sent",
  "quote.accepted", "order.created", "order.status_changed", "inventory.low_stock",
]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActiveApiProfile(req, res, ADMIN_ROLES);
  if (!actor) return;
  const companyId = actor.profile.company_id;
  if (!companyId) return res.status(403).json({ error: "Company access required" });

  const admin = getServiceSupabase();
  if (req.method === "GET") {
    try {
      const { data, error } = await admin.from("webhook_subscriptions")
        .select("id, company_id, label, event_type, target_url, is_active, last_fired_at, last_status, failure_count, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const webhooks = (data || []).map((row: any) => ({
        id: row.id,
        company_id: row.company_id,
        label: row.label,
        event_type: row.event_type,
        target_host: safeTargetHost(row.target_url),
        is_active: row.is_active,
        last_fired_at: row.last_fired_at,
        last_status: row.last_status,
        failure_count: row.failure_count,
        created_at: row.created_at,
      }));
      return res.status(200).json({ webhooks });
    } catch {
      return res.status(503).json({ error: "Could not load webhook settings" });
    }
  }

  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 120) : "";
  const eventType = String(req.body?.event_type || "");
  const target = typeof req.body?.target_url === "string"
    ? parsePublicWebhookUrl(req.body.target_url.trim())
    : null;
  if (!EVENT_TYPES.has(eventType)) return res.status(400).json({ error: "Unsupported webhook event" });
  if (!target) return res.status(400).json({ error: "Use a public HTTPS URL without credentials or a private network address" });

  try {
    const secret = `whsec_${crypto.randomBytes(32).toString("base64url")}`;
    const { data, error } = await admin.from("webhook_subscriptions").insert({
      company_id: companyId,
      label: label || null,
      event_type: eventType,
      target_url: target.toString(),
      signing_secret: secret,
    }).select("id, company_id, label, event_type, target_url, is_active, last_fired_at, last_status, failure_count, created_at").single();
    if (error) throw error;
    // The raw signing secret never enters a browser response or log.
    return res.status(201).json({ webhook: { ...data, target_url: undefined, target_host: safeTargetHost(data.target_url) } });
  } catch {
    return res.status(503).json({ error: "Could not create webhook" });
  }
}

function safeTargetHost(input: string): string | null {
  const target = parsePublicWebhookUrl(String(input || ""));
  return target?.host || null;
}

export default withApiRequestLogging(handler);
