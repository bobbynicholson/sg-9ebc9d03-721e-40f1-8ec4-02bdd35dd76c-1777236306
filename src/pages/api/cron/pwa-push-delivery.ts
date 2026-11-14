/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import webPush from "web-push";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { notificationDestination } from "@/lib/notificationLinks";
import { pwaIconUrl } from "@/lib/pwa/metadata";
import { withApiLogging } from "@/lib/withApiLogging";

const BATCH_SIZE = 60;
const MAX_ATTEMPTS = 5;
const PROCESSING_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

function configuredVapid() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:support@cateringms.com";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

function statusCodeOf(error: any): number | null {
  const value = Number(error?.statusCode);
  return Number.isFinite(value) ? value : null;
}

async function updateWorkerHealth(
  sb: any,
  status: "running" | "ok" | "degraded" | "failed",
  counts: { claimed: number; sent: number; retried: number; failed: number },
  errorMessage: string | null = null,
  startedAt?: string,
) {
  const now = new Date().toISOString();
  // Keep the previous completed timestamp visible while the next cron run is
  // in progress; an upsert with an omitted field would otherwise clear it.
  const previous = status === "running"
    ? await sb.from("web_push_delivery_health").select("last_finished_at")
      .eq("worker_key", "push_delivery").maybeSingle()
    : null;
  const values: Record<string, unknown> = {
    worker_key: "push_delivery",
    last_status: status,
    last_error: errorMessage,
    last_claimed: counts.claimed,
    last_sent: counts.sent,
    last_retried: counts.retried,
    last_failed: counts.failed,
    updated_at: now,
    last_finished_at: status === "running" ? previous?.data?.last_finished_at || null : now,
  };
  if (startedAt) values.last_started_at = startedAt;
  const { error } = await sb.from("web_push_delivery_health").upsert(values, { onConflict: "worker_key" });
  if (error) console.error("[pwa-push-delivery] heartbeat write failed");
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const startedAt = new Date().toISOString();
  const counts = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  await updateWorkerHealth(sb, "running", counts, null, startedAt);

  const vapid = configuredVapid();
  if (!vapid) {
    await updateWorkerHealth(sb, "failed", counts, "VAPID keys are not configured", startedAt);
    return res.status(503).json({ error: "Web Push VAPID keys are not configured" });
  }

  try {
    webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const staleLock = new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS).toISOString();
    const { data: staleJobs, error: staleJobsError } = await sb.from("web_push_notification_queue")
      .select("id, attempts")
      .eq("status", "processing")
      .lt("locked_at", staleLock)
      .limit(BATCH_SIZE);
    if (staleJobsError) throw staleJobsError;
    for (const staleJob of staleJobs || []) {
      const attempts = Number(staleJob.attempts || 0) + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      const { data: recovered, error } = await sb.from("web_push_notification_queue")
        .update({
          status: exhausted ? "failed" : "retry",
          attempts,
          locked_at: null,
          next_attempt_at: new Date(Date.now() + (exhausted ? 0 : 60 * 1000)).toISOString(),
          last_error: exhausted
            ? "Delivery worker lease expired too many times"
            : "Delivery worker lease expired; queued for retry",
        })
        .eq("id", staleJob.id)
        .eq("status", "processing")
        .lt("locked_at", staleLock)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (recovered) {
        if (exhausted) counts.failed += 1;
        else counts.retried += 1;
      }
    }

    const { data: dueJobs, error: dueError } = await sb.from("web_push_notification_queue")
      .select("id, notification_id, recipient_id, attempts")
      .in("status", ["pending", "retry"])
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (dueError) throw dueError;
    if (!dueJobs?.length) {
      await updateWorkerHealth(sb, counts.failed || counts.retried ? "degraded" : "ok", counts, null, startedAt);
      return res.status(200).json({ ok: true, ...counts });
    }

    // Claim conditionally so overlapping cron invocations cannot send the
    // same queue row. Only rows still pending/retry are returned by UPDATE.
    const jobIds = dueJobs.map((job: any) => job.id);
    const lockAt = new Date().toISOString();
    const { data: jobs, error: claimError } = await sb.from("web_push_notification_queue")
      .update({ status: "processing", locked_at: lockAt })
      .in("id", jobIds)
      .in("status", ["pending", "retry"])
      .select("id, notification_id, recipient_id, attempts, locked_at");
    if (claimError) throw claimError;
    if (!jobs?.length) {
      await updateWorkerHealth(sb, counts.failed || counts.retried ? "degraded" : "ok", counts, null, startedAt);
      return res.status(200).json({ ok: true, ...counts });
    }
    counts.claimed = jobs.length;

    const notificationIds = Array.from(new Set(jobs.map((job: any) => job.notification_id)));
    const recipientIds = Array.from(new Set(jobs.map((job: any) => job.recipient_id)));
    const { data: notifications, error: notificationError } = await sb.from("notifications")
      .select("id, recipient_id, user_id, company_id, title, message, link, action_url, target_role, related_entity_type, related_entity_id, priority, is_read")
      .in("id", notificationIds);
    if (notificationError) throw notificationError;

    const { data: profiles, error: profileError } = await sb.from("profiles")
      .select("id, company_id, role, active_role")
      .in("id", recipientIds);
    if (profileError) throw profileError;
    const companyIds = Array.from(new Set([
      ...(profiles || []).map((profile: any) => profile.company_id),
      ...(notifications || []).map((notification: any) => notification.company_id),
    ].filter(Boolean)));
    const { data: companies, error: companyError } = companyIds.length
      ? await sb.from("companies").select("id, slug, company_name, logo_url, primary_color").in("id", companyIds)
      : { data: [], error: null };
    if (companyError) throw companyError;

    const { data: subscriptions, error: subscriptionError } = await sb.from("web_push_subscriptions")
      .select("user_id, active_role, endpoint, subscription")
      .in("user_id", recipientIds);
    if (subscriptionError) throw subscriptionError;

    const notificationById = new Map((notifications || []).map((row: any) => [row.id, row]));
    const profileById = new Map<string, any>((profiles || []).map((row: any) => [row.id, row]));
    const companyById = new Map<string, any>((companies || []).map((row: any) => [row.id, row]));
    const subscriptionsByUser = new Map<string, any[]>();
    for (const subscription of subscriptions || []) {
      const list = subscriptionsByUser.get(subscription.user_id) || [];
      list.push(subscription);
      subscriptionsByUser.set(subscription.user_id, list);
    }

    const userRolePairs = Array.from(new Map((subscriptions || []).map((device: any) => {
      const profile = profileById.get(device.user_id);
      const role = String(device.active_role || profile?.active_role || profile?.role || "client");
      const key = `${device.user_id}:${role}`;
      return [key, { key, userId: device.user_id, role }];
    })).values());
    const unreadCountByUserRole = new Map<string, number>();
    await Promise.all(userRolePairs.map(async ({ key, userId, role }: any) => {
      const { count, error } = await sb.from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("is_read", false)
        .or(`target_role.eq.${role},target_role.is.null`);
      if (error) {
        console.warn("[pwa-push-delivery] unread count lookup failed", { userId, role, message: error.message });
      }
      unreadCountByUserRole.set(key, count || 0);
    }));

    let skipped = 0;

    const processJob = async (job: any) => {
      const notification: any = notificationById.get(job.notification_id);
      const profile: any = profileById.get(job.recipient_id);
      const recipientDevices = subscriptionsByUser.get(job.recipient_id) || [];
      const targetRole = String(notification?.target_role || "").trim();
      const devices = recipientDevices.filter((device: any) => {
        if (!targetRole) return true;
        const deviceRole = String(device.active_role || profile?.active_role || profile?.role || "client");
        return deviceRole === targetRole;
      });

      if (!notification || notification.is_read || !profile || devices.length === 0) {
        const { data: marked, error } = await sb.from("web_push_notification_queue")
          .update({ status: "sent", sent_at: new Date().toISOString(), locked_at: null, last_error: null })
          .eq("id", job.id).eq("status", "processing").eq("locked_at", job.locked_at).select("id").maybeSingle();
        if (error) throw error;
        if (!marked) return;
        skipped += 1;
        return;
      }

      // The event's tenant is the best branding source (especially for
      // platform admins who may receive an alert from another company).
      const companyId = notification.company_id || profile.company_id;
      const company = companyById.get(companyId);
      const icon = pwaIconUrl(company ? {
        id: company.id,
        slug: company.slug,
        companyName: company.company_name,
        logoUrl: company.logo_url,
        primaryColor: company.primary_color,
      } : null, 192);
      // Push services cap encrypted payload size at roughly 4 KB. Keep the
      // system alert concise; the linked in-app page retains the full text.
      const results = await Promise.all(devices.map(async (device: any) => {
        try {
          const deviceRole = String(device.active_role || profile.active_role || profile.role || "client");
          const target = notificationDestination(
            notification,
            deviceRole,
            company?.slug || null,
          );
          const roleKey = `${job.recipient_id}:${deviceRole}`;
          const payload = JSON.stringify({
            title: String(notification.title || "CateringMS notification").slice(0, 120),
            body: String(notification.message || "You have a new update.").slice(0, 320),
            url: target,
            icon,
            badge: icon,
            notificationId: notification.id,
            unreadCount: unreadCountByUserRole.get(roleKey) || 0,
            priority: notification.priority || "normal",
          });
          await webPush.sendNotification(device.subscription, payload, {
            TTL: 60 * 60 * 12,
            urgency: notification.priority === "urgent" || notification.priority === "high" ? "high" : "normal",
          });
          return { ok: true as const };
        } catch (error: any) {
          const statusCode = statusCodeOf(error);
          if (statusCode === 404 || statusCode === 410) {
            await sb.from("web_push_subscriptions").delete().eq("endpoint", device.endpoint);
            return { ok: true as const };
          }
          console.warn("[pwa-push-delivery] device delivery failed", {
            jobId: job.id,
            statusCode,
          });
          return { ok: false as const, statusCode };
        }
      }));

      const failures = results.filter((result: any) => !result.ok);
      if (failures.length === 0) {
        const { data: marked, error } = await sb.from("web_push_notification_queue")
          .update({ status: "sent", sent_at: new Date().toISOString(), locked_at: null, last_error: null })
          .eq("id", job.id).eq("status", "processing").eq("locked_at", job.locked_at).select("id").maybeSingle();
        if (error) throw error;
        if (!marked) return;
        counts.sent += 1;
        return;
      }

      const attempts = Number(job.attempts || 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "retry";
      const delaySeconds = Math.min(60 * (2 ** (attempts - 1)), 60 * 60);
      const { data: marked, error } = await sb.from("web_push_notification_queue")
        .update({
          status,
          attempts,
          locked_at: null,
          next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
          last_error: `Push provider returned ${failures.map((item: any) => item.statusCode || "an error").join(",")}`.slice(0, 500),
        })
        .eq("id", job.id).eq("status", "processing").eq("locked_at", job.locked_at).select("id").maybeSingle();
      if (error) throw error;
      if (!marked) return;
      if (status === "failed") counts.failed += 1;
      else counts.retried += 1;
    };

    // Bound concurrent outbound requests so one large broadcast does not
    // overwhelm the app server or the browser push providers.
    for (let index = 0; index < jobs.length; index += 8) {
      await Promise.all(jobs.slice(index, index + 8).map(processJob));
    }

    await updateWorkerHealth(
      sb,
      counts.failed > 0 || counts.retried > 0 ? "degraded" : "ok",
      counts,
      null,
      startedAt,
    );
    return res.status(200).json({ ok: true, ...counts, skipped });
  } catch (error: any) {
    console.error("[pwa-push-delivery] delivery batch failed:", error?.message || error);
    await updateWorkerHealth(sb, "failed", counts, "Worker failed; check Vercel function logs", startedAt);
    return res.status(500).json({ error: "Web Push delivery failed" });
  }
}

export default withApiLogging(handler);
