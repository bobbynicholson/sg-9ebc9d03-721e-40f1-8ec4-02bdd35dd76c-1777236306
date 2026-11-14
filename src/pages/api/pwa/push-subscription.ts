import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiRequestLogging } from "@/lib/withApiLogging";
import { deriveUserRoles } from "@/lib/roleDerivation";
import type { UserRole } from "@/types/app";

type PushSubscriptionPayload = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  activeRole?: unknown;
};

function vapidConfig() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:support@cateringms.com";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

function sameOriginRequest(req: NextApiRequest): boolean {
  const origin = req.headers.origin;
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  const host = String(hostHeader || "").split(",")[0].trim().toLowerCase();
  if (typeof origin !== "string" || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com"
      || host === "web.push.apple.com"
      || host === "push.services.mozilla.com"
      || host.endsWith(".push.services.mozilla.com");
  } catch {
    return false;
  }
}

function validSubscription(value: unknown): value is PushSubscriptionPayload {
  if (!value || typeof value !== "object") return false;
  const subscription = value as PushSubscriptionPayload;
  return validEndpoint(subscription.endpoint)
    && typeof subscription.keys?.p256dh === "string"
    && /^[A-Za-z0-9_-]{32,256}$/.test(subscription.keys.p256dh)
    && typeof subscription.keys?.auth === "string"
    && /^[A-Za-z0-9_-]{16,128}$/.test(subscription.keys.auth);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
    const config = vapidConfig();
    return res.status(200).json({ enabled: Boolean(config), publicKey: config?.publicKey || null });
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!sameOriginRequest(req)) return res.status(403).json({ error: "Request origin could not be verified" });
  if (!vapidConfig()) return res.status(503).json({ error: "Device push notifications are not configured" });

  const subscriptionBody = req.body as PushSubscriptionPayload;
  const endpoint = req.method === "DELETE" ? subscriptionBody?.endpoint : subscriptionBody?.endpoint;
  if (req.method === "POST" && !validSubscription(subscriptionBody)) {
    return res.status(400).json({ error: "Invalid push subscription" });
  }
  if (req.method === "DELETE" && !validEndpoint(endpoint)) {
    return res.status(400).json({ error: "Invalid push endpoint" });
  }

  try {
    const sessionDb = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await sessionDb.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: "Sign in to manage device notifications" });

    const { data: profile, error: profileError } = await sessionDb
      .from("profiles")
      .select("company_id, is_active, deleted_at, role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile || profile.is_active === false || profile.deleted_at) {
      return res.status(403).json({ error: "This account cannot receive notifications" });
    }

    const service = getServiceSupabase() as any;
    if (req.method === "POST") {
      const { data: assignments, error: assignmentsError } = await service
        .from("user_departments")
        .select("department, is_primary")
        .eq("user_id", user.id);
      if (assignmentsError) throw assignmentsError;

      const assignedRoles = deriveUserRoles({
        profileRole: profile.role,
        activeRole: profile.active_role,
        departments: assignments || [],
      });
      const activeRole = typeof subscriptionBody.activeRole === "string"
        ? subscriptionBody.activeRole
        : assignedRoles.activeRole;
      if (!assignedRoles.roles.includes(activeRole as UserRole)) {
        return res.status(403).json({ error: "This portal is not assigned to your account" });
      }

      const { error } = await service.from("web_push_subscriptions").upsert({
        user_id: user.id,
        company_id: profile.company_id || null,
        active_role: activeRole,
        endpoint: subscriptionBody.endpoint,
        subscription: {
          endpoint: subscriptionBody.endpoint,
          expirationTime: subscriptionBody.expirationTime ?? null,
          keys: subscriptionBody.keys,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    const { error } = await service.from("web_push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[pwa/push-subscription] request failed:", error);
    return res.status(500).json({ error: "Device notification settings could not be saved" });
  }
}

export default withApiRequestLogging(handler);
