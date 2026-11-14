/**
 * GET /api/cron/whatsapp-drain
 *
 * WA-A (task #99, 2026-05-24): WhatsApp outbound queue worker.
 * Mirrors process-email-queue.ts but for the whatsapp_messages
 * table created in migration 20260524210000.
 *
 * Claims due pending messages with a lease, fires each through Meta's
 * Graph API, and stamps the result columns. Expired leases are recovered
 * after a timeout so overlapping runs cannot immediately re-send them.
 *
 * Auth: Vercel Cron bearer token (CRON_SECRET) - same gate every
 * other cron in this folder uses.
 *
 * Scheduling: vercel.json adds an entry hitting this every 5
 * minutes. WhatsApp is operator-facing - 15 minutes would feel
 * sluggish for "Mark as paid" -> "client gets receipt" loops.
 *
 * Retry: attempts column increments each fire. Hard cap at 5.
 * Backoff doubles between tries (1m, 2m, 4m, 8m, 16m) before
 * giving up and writing status='failed' + failure_reason. After
 * MAX_ATTEMPTS the row stays in the table for audit + the
 * notifications surface so an admin can see what didn't go.
 *
 * Per-tenant gate: only sends if the company has an active
 * integrations row of type='whatsapp'. Tenants without WhatsApp
 * configured will still enqueue rows (broadcastNotification adds
 * them speculatively) - we just leave them at status='pending'
 * forever. The drain skips them silently. When the tenant
 * connects WhatsApp the queue starts flushing.
 *
 * A lease + status/attempt compare-and-set prevents overlapping drains from
 * claiming the same row. External delivery is at-least-once: if Meta accepts
 * a message and the process dies before saving the receipt, a later lease
 * recovery can retry it because the WhatsApp send API has no queue-row
 * idempotency key.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { alertWhatsAppFailures, flagWhatsAppConnectionProblem, isConnectionProblem } from "@/lib/whatsapp/alerts";
import { loadWhatsAppCredentials, postWhatsAppMessage, type StoredWhatsAppCredentials } from "@/lib/whatsapp/credentials";


const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;
const CRON_NAME = "whatsapp-drain";

interface QueueRow {
  id: string;
  company_id: string;
  recipient_phone: string;
  recipient_name: string | null;
  message_type: "text" | "template";
  message_content: string | null;
  template_name: string | null;
  template_language: string | null;
  template_params: Record<string, unknown> | null;
  attempts: number;
}

function backoffMinutes(attempts: number): number {
  // 1, 2, 4, 8, 16 - capped by MAX_ATTEMPTS.
  return Math.min(16, Math.pow(2, attempts));
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = getServiceSupabase();
  const nowIso = new Date().toISOString();

  // Per-tenant gate: only drain for companies with active WhatsApp
  // integration. Other tenants' rows stay pending; harmless.
  const { data: connectedTenants, error: tenantErr } = await supabase
    .from("integrations")
    .select("company_id")
    .eq("integration_type", "whatsapp")
    .eq("is_active", true);

  if (tenantErr) {
    console.error("[cron/whatsapp-drain] integrations lookup failed:", tenantErr);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, run_id: auth.runId, error_message: tenantErr.message,
    });
    return res.status(500).json({ error: tenantErr.message });
  }

  const allowList = ((connectedTenants || []) as Array<{ company_id: string }>).map((t) => t.company_id);
  if (allowList.length === 0) {
    await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
      source: auth.source, run_id: auth.runId, sent: 0, failed: 0,
      note: "no_connected_tenants",
    });
    return res.status(200).json({
      ok: true, sent: 0, failed: 0,
      note: "No tenants have WhatsApp integration active.",
    });
  }

  // Cache integrations by company so each row doesn't re-fetch.
  const integrationByCompany: Record<string, StoredWhatsAppCredentials | null> = {};

  // Recover only expired sending leases. Older queue rows predate locked_at;
  // their created_at provides a conservative fallback timestamp.
  const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS).toISOString();
  const { data: staleRows, error: staleReadError } = await supabase
    .from("whatsapp_messages")
    .select("id, attempts, locked_at, created_at")
    .eq("status", "sending")
    .or(`locked_at.lt.${staleBefore},and(locked_at.is.null,created_at.lt.${staleBefore})`)
    .lt("attempts", MAX_ATTEMPTS)
    .limit(BATCH_SIZE);

  if (staleReadError) {
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, run_id: auth.runId, error_message: staleReadError.message,
    });
    return res.status(500).json({ error: staleReadError.message });
  }

  let recovered = 0;
  for (const stale of staleRows || []) {
    let recovery = supabase.from("whatsapp_messages")
      .update({ status: "pending", locked_at: null, next_attempt_at: nowIso });
    recovery = stale.locked_at
      ? recovery.eq("locked_at", stale.locked_at)
      : recovery.is("locked_at", null).lt("created_at", staleBefore);
    const { data: recoveredRow, error: recoveryError } = await recovery
      .eq("id", stale.id).eq("status", "sending").select("id").maybeSingle();
    if (recoveryError) {
      console.error("[cron/whatsapp-drain] stale lease recovery failed:", recoveryError);
      continue;
    }
    if (recoveredRow) recovered += 1;
  }

  // Attempts exhausted while a worker was interrupted: retain it as failed
  // for operator review instead of leaving a permanently invisible `sending` row.
  const { data: exhaustedRows, error: exhaustedReadError } = await supabase
    .from("whatsapp_messages")
    .select("id, locked_at, created_at")
    .eq("status", "sending")
    .gte("attempts", MAX_ATTEMPTS)
    .or(`locked_at.lt.${staleBefore},and(locked_at.is.null,created_at.lt.${staleBefore})`)
    .limit(BATCH_SIZE);
  if (exhaustedReadError) {
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, run_id: auth.runId, error_message: exhaustedReadError.message,
    });
    return res.status(500).json({ error: exhaustedReadError.message });
  }
  for (const stale of exhaustedRows || []) {
    let exhausted = supabase.from("whatsapp_messages").update({
      status: "failed",
      locked_at: null,
      failed_at: new Date().toISOString(),
      failure_reason: "Delivery worker lease expired after the maximum attempts; check WhatsApp before manually retrying.",
      next_attempt_at: null,
    });
    exhausted = stale.locked_at
      ? exhausted.eq("locked_at", stale.locked_at)
      : exhausted.is("locked_at", null).lt("created_at", staleBefore);
    const { error } = await exhausted.eq("id", stale.id).eq("status", "sending");
    if (error) console.error("[cron/whatsapp-drain] exhausted lease update failed:", error);
  }

  // Read only pending work. Sending rows are eligible again only through the
  // timed recovery above, never simply because another cron invocation began.
  const { data: due, error: readErr } = await supabase
    .from("whatsapp_messages")
    .select("id, company_id, recipient_phone, recipient_name, message_type, message_content, template_name, template_language, template_params, attempts")
    .eq("status", "pending")
    .in("company_id", allowList)
    .lte("next_attempt_at", nowIso)
    .lt("attempts", MAX_ATTEMPTS)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (readErr) {
    console.error("[cron/whatsapp-drain] claim failed:", readErr);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, run_id: auth.runId, error_message: readErr.message,
    });
    return res.status(500).json({ error: readErr.message });
  }

  const rows = (due || []) as QueueRow[];
  let sent = 0;
  let failed = 0;
  const failedByCompany = new Map<string, number>();
  const connectionProblems = new Set<string>();

  for (const row of rows) {
    // Atomic compare-and-set claim. Include attempts so a stale selection
    // cannot overwrite a newer retry state from another worker.
    const lockAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("whatsapp_messages")
      .update({ status: "sending", attempts: row.attempts + 1, locked_at: lockAt })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("attempts", row.attempts)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("[cron/whatsapp-drain] row claim failed:", row.id, claimError);
      continue;
    }
    if (!claimed) continue;

    let ok = false;
    let gatewayId: string | null = null;
    let gatewayResponse: unknown = null;
    let failureReason: string | null = null;

    try {
      // Per-company credentials, cached for the batch.
      if (!(row.company_id in integrationByCompany)) {
        integrationByCompany[row.company_id] = await loadWhatsAppCredentials(supabase, row.company_id);
      }
      const integration = integrationByCompany[row.company_id];
      if (!integration?.phoneNumberId || !integration.accessTokenEncrypted) {
        throw new Error("WhatsApp integration credentials missing");
      }

      const body: Record<string, unknown> = {
        to: row.recipient_phone,
        type: row.message_type,
      };
      if (row.message_type === "text") {
        if (!row.message_content) throw new Error("text message has no content");
        body.text = { body: row.message_content };
      } else if (row.message_type === "template") {
        if (!row.template_name) throw new Error("template message has no template_name");
        body.template = {
          name: row.template_name,
          language: { code: row.template_language || "en" },
          components: row.template_params?.components || [],
        };
      }

      const result = await postWhatsAppMessage(integration, body);
      gatewayResponse = result.response;
      if (!result.ok) throw new Error(result.error || "WhatsApp send failed");
      gatewayId = result.id;
      ok = true;
    } catch (e) {
      failureReason = e instanceof Error ? e.message : String(e);
    }

    if (ok) {
      const { error: sentUpdateError } = await supabase
        .from("whatsapp_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          gateway_message_id: gatewayId,
          gateway_response: gatewayResponse,
          failure_reason: null,
        })
        .eq("id", row.id).eq("status", "sending").eq("locked_at", lockAt);
      if (sentUpdateError) throw sentUpdateError;
      sent += 1;
    } else {
      const newAttempts = row.attempts + 1;
      const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      const next = new Date(Date.now() + backoffMinutes(newAttempts) * 60_000).toISOString();
      const { error: failureUpdateError } = await supabase
        .from("whatsapp_messages")
        .update({
          status: finalStatus,
          locked_at: null,
          failure_reason: failureReason,
          failed_at: finalStatus === "failed" ? new Date().toISOString() : null,
          gateway_response: gatewayResponse,
          next_attempt_at: finalStatus === "failed" ? null : next,
        })
        .eq("id", row.id).eq("status", "sending").eq("locked_at", lockAt);
      if (failureUpdateError) {
        console.error("[cron/whatsapp-drain] failure state update failed:", row.id, failureUpdateError);
      }
      failed += 1;
      if (isConnectionProblem(failureReason)) connectionProblems.add(row.company_id);
      if (finalStatus === "failed") failedByCompany.set(row.company_id, (failedByCompany.get(row.company_id) || 0) + 1);
    }
  }

  for (const companyId of connectionProblems) await flagWhatsAppConnectionProblem(supabase, companyId);
  for (const [companyId, count] of failedByCompany) await alertWhatsAppFailures(companyId, count);

  await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
    source: auth.source, run_id: auth.runId,
    processed: rows.length,
    stale_recovered: recovered,
    sent,
    failed,
    tenants_connected: allowList.length,
  });

  return res.status(200).json({
    ok: true,
    processed: rows.length,
    sent,
    failed,
    tenants_connected: allowList.length,
  });
}

export default withApiLogging(handler);
