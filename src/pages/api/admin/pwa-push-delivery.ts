/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireActiveApiProfile } from "@/lib/requireActiveApiProfile";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

const ADMIN_ROLES = new Set(["super_admin", "owner", "company_admin", "admin"]);

function companyScope(req: NextApiRequest, actor: { profile: { company_id?: string | null }; role: string }) {
  if (actor.profile.company_id) return actor.profile.company_id;
  return actor.role === "super_admin" ? String(req.query.company_id || "") : "";
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  const actor = await requireActiveApiProfile(req, res, ADMIN_ROLES);
  if (!actor) return;

  const companyId = companyScope(req, actor as any);
  if (!companyId) return res.status(400).json({ error: "Open a company workspace to view push delivery." });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) {
    return res.status(400).json({ error: "Choose a valid company workspace." });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const db: any = getServiceSupabase();
  if (req.method === "POST") {
    const queueId = String(req.body?.queueId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(queueId)) {
      return res.status(400).json({ error: "Choose a valid failed delivery." });
    }
    const { data: failedJob, error: lookupError } = await db.from("web_push_notification_queue")
      .select("id, manual_retry_count")
      .eq("id", queueId)
      .eq("company_id", companyId)
      .eq("status", "failed")
      .maybeSingle();
    if (lookupError) {
      console.error("[admin/pwa-push-delivery] retry lookup failed:", lookupError.message);
      return res.status(503).json({ error: "The failed delivery could not be queued again." });
    }
    if (!failedJob) return res.status(404).json({ error: "That failed delivery was not found or was already retried." });

    const { data, error } = await db.from("web_push_notification_queue")
      .update({
        status: "pending",
        attempts: 0,
        manual_retry_count: Number(failedJob.manual_retry_count || 0) + 1,
        last_manual_retry_at: new Date().toISOString(),
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        sent_at: null,
        last_error: null,
      })
      .eq("id", queueId)
      .eq("company_id", companyId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[admin/pwa-push-delivery] retry request failed:", error.message);
      return res.status(503).json({ error: "The failed delivery could not be queued again." });
    }
    if (!data) return res.status(409).json({ error: "That failed delivery was already changed. Refresh the page." });
    return res.status(200).json({ ok: true, queueId: data.id });
  }

  try {
    const [healthResult, pendingResult, retryResult, processingResult, staleResult, failedResult] = await Promise.all([
      db.from("web_push_delivery_health")
        .select("last_started_at, last_finished_at, last_status, last_error, last_claimed, last_sent, last_retried, last_failed")
        .eq("worker_key", "push_delivery")
        .maybeSingle(),
      db.from("web_push_notification_queue").select("id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("status", "pending"),
      db.from("web_push_notification_queue").select("id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("status", "retry"),
      db.from("web_push_notification_queue").select("id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("status", "processing"),
      db.from("web_push_notification_queue").select("id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("status", "processing")
        .lt("locked_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()),
      db.from("web_push_notification_queue")
        .select("id, notification_id, recipient_id, attempts, manual_retry_count, last_manual_retry_at, created_at, last_error", { count: "exact" })
        .eq("company_id", companyId).eq("status", "failed")
        .order("created_at", { ascending: false }).limit(25),
    ]);

    const errors = [healthResult, pendingResult, retryResult, processingResult, staleResult, failedResult]
      .filter((result: any) => result.error);
    if (errors.length) throw errors[0].error;

    const failedRows = failedResult.data || [];
    const notificationIds = Array.from(new Set(failedRows.map((row: any) => row.notification_id)));
    const recipientIds = Array.from(new Set(failedRows.map((row: any) => row.recipient_id)));
    const [{ data: notifications }, { data: profiles }] = await Promise.all([
      notificationIds.length
        ? db.from("notifications").select("id, title").in("id", notificationIds)
        : Promise.resolve({ data: [] }),
      recipientIds.length
        ? db.from("profiles").select("id, full_name").eq("company_id", companyId).in("id", recipientIds)
        : Promise.resolve({ data: [] }),
    ]);
    const notificationById = new Map<string, any>((notifications || []).map((row: any) => [row.id, row]));
    const profileById = new Map<string, any>((profiles || []).map((row: any) => [row.id, row]));

    return res.status(200).json({
      health: healthResult.data || null,
      counts: {
        pending: pendingResult.count || 0,
        retry: retryResult.count || 0,
        processing: processingResult.count || 0,
        staleProcessing: staleResult.count || 0,
        failed: failedResult.count || 0,
        failedShown: failedRows.length,
      },
      failedJobs: failedRows.map((row: any) => ({
        id: row.id,
        attempts: row.attempts,
        manualRetryCount: row.manual_retry_count || 0,
        lastManualRetryAt: row.last_manual_retry_at,
        createdAt: row.created_at,
        lastError: row.last_error,
        notificationTitle: notificationById.get(row.notification_id)?.title || "Notification",
        recipientName: profileById.get(row.recipient_id)?.full_name || "Staff account",
      })),
    });
  } catch (error: any) {
    console.error("[admin/pwa-push-delivery] health lookup failed:", error?.message || error);
    return res.status(503).json({ error: "Push delivery health could not be loaded." });
  }
}

export default withApiLogging(handler);
