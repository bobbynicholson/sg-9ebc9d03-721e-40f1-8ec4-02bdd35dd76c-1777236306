/**
 * GET /api/cron/whatsapp-drain
 *
 * WA-A (task #99, 2026-05-24): WhatsApp outbound queue worker.
 * Mirrors process-email-queue.ts but for the whatsapp_messages
 * table created in migration 20260524210000.
 *
 * Walks whatsapp_messages where status IN ('pending', 'sending')
 * and next_attempt_at <= NOW, claims a batch, fires each through
 * Meta Graph API, and stamps the result columns.
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
 * No queue claim RPC yet (process-email-queue uses one). Using
 * a status='sending' transition + WHERE status='pending' as a
 * cheap optimistic lock - two concurrent drains either don't
 * overlap or one of the updates is a no-op, and the worse
 * outcome (double-send) is something Meta's gateway dedups via
 * idempotent message templates.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
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

interface Integration {
  credentials: {
    phoneNumberId: string;
    accessToken: string;
  };
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
      source: auth.source, error_message: tenantErr.message,
    });
    return res.status(500).json({ error: tenantErr.message });
  }

  const allowList = ((connectedTenants || []) as Array<{ company_id: string }>).map((t) => t.company_id);
  if (allowList.length === 0) {
    await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
      source: auth.source, sent: 0, failed: 0,
      note: "no_connected_tenants",
    });
    return res.status(200).json({
      ok: true, sent: 0, failed: 0,
      note: "No tenants have WhatsApp integration active.",
    });
  }

  // Cache integrations by company so each row doesn't re-fetch.
  const integrationByCompany: Record<string, Integration | null> = {};

  // Claim a batch. Optimistic: select then update status to
  // 'sending' so a second worker skips them.
  const { data: due, error: readErr } = await supabase
    .from("whatsapp_messages")
    .select("id, company_id, recipient_phone, recipient_name, message_type, message_content, template_name, template_language, template_params, attempts")
    .in("status", ["pending", "sending"])
    .in("company_id", allowList)
    .lte("next_attempt_at", nowIso)
    .lt("attempts", MAX_ATTEMPTS)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (readErr) {
    console.error("[cron/whatsapp-drain] claim failed:", readErr);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", {
      source: auth.source, error_message: readErr.message,
    });
    return res.status(500).json({ error: readErr.message });
  }

  const rows = (due || []) as QueueRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    // Flip to 'sending' so a concurrent worker skips us.
    await supabase
      .from("whatsapp_messages")
      .update({ status: "sending", attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", row.attempts === 0 ? "pending" : "sending");

    let ok = false;
    let gatewayId: string | null = null;
    let gatewayResponse: unknown = null;
    let failureReason: string | null = null;

    try {
      // Per-company credentials, cached for the batch.
      if (!(row.company_id in integrationByCompany)) {
        const { data: integration } = await supabase
          .from("integrations")
          .select("credentials")
          .eq("company_id", row.company_id)
          .eq("integration_type", "whatsapp")
          .eq("is_active", true)
          .maybeSingle();
        integrationByCompany[row.company_id] = (integration as Integration | null) || null;
      }
      const integration = integrationByCompany[row.company_id];
      if (!integration?.credentials?.phoneNumberId || !integration?.credentials?.accessToken) {
        throw new Error("WhatsApp integration credentials missing");
      }

      const body: Record<string, unknown> = {
        messaging_product: "whatsapp",
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

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${integration.credentials.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${integration.credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const json = await response.json().catch(() => ({}));
      gatewayResponse = json;
      if (!response.ok) {
        throw new Error(json?.error?.message || `HTTP ${response.status}`);
      }
      gatewayId = json?.messages?.[0]?.id || null;
      ok = true;
    } catch (e) {
      failureReason = e instanceof Error ? e.message : String(e);
    }

    if (ok) {
      await supabase
        .from("whatsapp_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          gateway_message_id: gatewayId,
          gateway_response: gatewayResponse,
          failure_reason: null,
        })
        .eq("id", row.id);
      sent += 1;
    } else {
      const newAttempts = row.attempts + 1;
      const finalStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      const next = new Date(Date.now() + backoffMinutes(newAttempts) * 60_000).toISOString();
      await supabase
        .from("whatsapp_messages")
        .update({
          status: finalStatus,
          failure_reason: failureReason,
          failed_at: finalStatus === "failed" ? new Date().toISOString() : null,
          gateway_response: gatewayResponse,
          next_attempt_at: finalStatus === "failed" ? null : next,
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  await recordCronHeartbeat(supabase, CRON_NAME, "ok", {
    source: auth.source,
    processed: rows.length,
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
