import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import * as webPush from "web-push";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { deriveUserRoles } from "@/lib/roleDerivation";
import { notificationDestination } from "@/lib/notificationLinks";
import { pwaIconUrl } from "@/lib/pwa/metadata";
import { getVapidConfig } from "@/lib/pwa/vapidConfig";
import { withApiRequestLogging } from "@/lib/withApiLogging";

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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!sameOriginRequest(req)) return res.status(403).json({ error: "This request could not be verified. Reload the app and try again." });

  const endpoint = req.body?.endpoint;
  if (!validEndpoint(endpoint)) return res.status(400).json({ error: "This device could not be checked. Turn alerts off and on again." });

  try {
    const sessionDb = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await sessionDb.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: "Please sign in again, then send the test alert." });

    const { data: profile, error: profileError } = await sessionDb
      .from("profiles")
      .select("company_id, role, active_role, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile || profile.is_active === false || profile.deleted_at) {
      return res.status(403).json({ error: "This account is not able to receive alerts. Ask your administrator for help." });
    }

    const db: any = getServiceSupabase();
    const { data: device, error: deviceError } = await db.from("web_push_subscriptions")
      .select("subscription, active_role")
      .eq("user_id", user.id)
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (deviceError) {
      console.error("[pwa/push-test] device lookup failed");
      return res.status(503).json({ error: "This device could not be checked just now. Try again shortly." });
    }
    if (!device?.subscription) {
      return res.status(409).json({ error: "This device is not connected yet. Tap Enable alerts, then allow notifications." });
    }

    const { data: assignments, error: assignmentError } = await db.from("user_departments")
      .select("department, is_primary")
      .eq("user_id", user.id);
    if (assignmentError) {
      console.error("[pwa/push-test] role lookup failed");
      return res.status(503).json({ error: "Your app access could not be checked just now. Try again shortly." });
    }
    const { activeRole } = deriveUserRoles({
      profileRole: profile.role,
      activeRole: device.active_role || profile.active_role,
      departments: assignments || [],
    });

    let company: any = null;
    if (profile.company_id) {
      const { data } = await db.from("companies")
        .select("id, slug, company_name, logo_url, primary_color")
        .eq("id", profile.company_id)
        .maybeSingle();
      company = data;
    }
    const icon = pwaIconUrl(company ? {
      id: company.id,
      slug: company.slug,
      companyName: company.company_name,
      logoUrl: company.logo_url,
      primaryColor: company.primary_color,
    } : null, 192);
    const vapid = getVapidConfig();
    webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const payload = JSON.stringify({
      title: `${company?.company_name || "CateringMS"} test alert`.slice(0, 120),
      body: "Push alerts are reaching this device. This was sent from your notification settings.",
      url: notificationDestination({}, activeRole, company?.slug || null),
      icon,
      badge: icon,
      notificationId: `push-test-${randomUUID()}`,
      silent: false,
    });
    const providerResponse = await webPush.sendNotification(device.subscription, payload, {
      TTL: 300,
      urgency: "normal",
    });
    return res.status(200).json({ ok: true, providerStatus: providerResponse.statusCode });
  } catch (cause: any) {
    const statusCode = Number(cause?.statusCode) || 0;
    if (statusCode === 404 || statusCode === 410) {
      const db: any = getServiceSupabase();
      await db.from("web_push_subscriptions").delete().eq("endpoint", endpoint);
      return res.status(410).json({ error: "This device's alert connection expired. Tap Enable alerts to reconnect it." });
    }
    if (statusCode === 401 || statusCode === 403) {
      console.error("[pwa/push-test] provider rejected notification credentials");
      return res.status(502).json({ error: "This app could not send the test alert. Please contact support to finish notification setup." });
    }
    console.error("[pwa/push-test] push send failed", statusCode || "unknown provider error");
    return res.status(503).json({ error: "The test alert could not be delivered. Check that notifications are allowed for this app, then try again." });
  }
}

export default withApiRequestLogging(handler);
