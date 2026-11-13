/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import { callMeta, loadWhatsAppCredentials } from "@/lib/whatsapp/credentials";

const LOCKED_SYNC_STATES = new Set(["starting", "requested", "syncing", "complete", "declined", "unknown"]);

async function updateSyncSettings(sb: any, row: any, patch: Record<string, unknown>) {
  const { data: current, error: readError } = await sb.from("integrations")
    .select("settings").eq("id", row.id).eq("company_id", row.company_id).maybeSingle();
  if (readError) return readError;
  const { error } = await sb.from("integrations")
    .update({ settings: { ...(current?.settings || row.settings || {}), ...patch } })
    .eq("id", row.id).eq("company_id", row.company_id);
  return error;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await companyForAdmin(req, res);
  if (!access) return;

  const requestHost = String(req.headers.host || "").toLowerCase();
  if (process.env.NODE_ENV !== "test" && (
    process.env.NODE_ENV !== "production" || /(^|[.:])(?:localhost|127\.0\.0\.1)(?=[:.]|$)/.test(requestHost)
  )) {
    return res.status(409).json({ error: "Run the one-time history sync from the published CateringMS site. Meta sends the history to the public webhook, so local development must not start the request." });
  }

  const sb: any = getServiceSupabase();
  const { data: row, error: rowError } = await sb.from("integrations")
    .select("id, company_id, credentials, settings, is_active")
    .eq("company_id", access.companyId).eq("integration_type", "whatsapp").maybeSingle();
  if (rowError) return res.status(500).json({ error: "Could not read the WhatsApp connection." });
  if (!row?.is_active) return res.status(400).json({ error: "Connect the WhatsApp number first." });
  if (!row.settings?.webhookVerifiedAt) {
    return res.status(409).json({ error: "Verify the Meta webhook first, then subscribe the app to history and smb_message_echoes." });
  }

  const currentStatus = String(row.settings?.whatsappBusinessAppHistoryStatus || "");
  if (LOCKED_SYNC_STATES.has(currentStatus) || (currentStatus === "failed" && row.settings?.whatsappBusinessAppHistoryRequestedAt)) {
    return res.status(409).json({
      error: currentStatus === "complete"
        ? "WhatsApp history sync has completed. Meta only allows this history request once per onboarding."
        : "A WhatsApp history sync has already been requested or is in progress. It will continue as Meta sends history webhooks.",
      historySync: {
        status: currentStatus,
        progress: Number(row.settings?.whatsappBusinessAppHistoryProgress) || 0,
        requestedAt: row.settings?.whatsappBusinessAppHistoryRequestedAt || null,
        requestId: row.settings?.whatsappBusinessAppHistoryRequestId || null,
      },
    });
  }

  const credentials = await loadWhatsAppCredentials(sb, access.companyId);
  if (!credentials) return res.status(400).json({ error: "Reconnect WhatsApp so the server can access its saved Meta credentials." });

  let numberStatus: Awaited<ReturnType<typeof callMeta>>;
  try {
    numberStatus = await callMeta(credentials, `${credentials.phoneNumberId}?fields=is_on_biz_app,platform_type`);
  } catch {
    return res.status(502).json({ error: "Meta could not confirm this number's WhatsApp Business app connection. Try again." });
  }
  if (!numberStatus.ok) {
    return res.status(502).json({ error: `Meta could not check WhatsApp Business app eligibility: ${numberStatus.error || "request failed"}` });
  }
  if (numberStatus.json?.is_on_biz_app !== true || numberStatus.json?.platform_type !== "CLOUD_API") {
    return res.status(409).json({
      error: "Meta reports this number is not connected to Cloud API through WhatsApp Business app coexistence. Phone-app chats cannot be imported until it is onboarded through Meta Embedded Signup with history sharing enabled.",
      businessAppConnected: false,
    });
  }

  const attemptedAt = new Date().toISOString();
  let lock = sb.from("integrations").update({ settings: {
    ...(row.settings || {}),
    whatsappBusinessAppHistoryStatus: "starting",
    whatsappBusinessAppHistoryLastAttemptAt: attemptedAt,
    whatsappBusinessAppHistoryLastError: null,
  } }).eq("id", row.id).eq("company_id", access.companyId);
  lock = currentStatus === "failed"
    ? lock.eq("settings->>whatsappBusinessAppHistoryStatus", "failed")
    : lock.is("settings->>whatsappBusinessAppHistoryStatus", null);
  const { data: claimed, error: lockError } = await lock.select("id");
  if (lockError) return res.status(500).json({ error: "Could not safely start the one-time history sync." });
  if (!claimed?.length) return res.status(409).json({ error: "Another admin has already started this one-time history sync. Refresh the page to see its status." });

  let sync: Awaited<ReturnType<typeof callMeta>>;
  try {
    sync = await callMeta(credentials, `${credentials.phoneNumberId}/smb_app_data`, {
      method: "POST",
      body: { messaging_product: "whatsapp", sync_type: "history" },
    });
  } catch {
    await updateSyncSettings(sb, row, {
      whatsappBusinessAppHistoryStatus: "unknown",
      whatsappBusinessAppHistoryRequestedAt: attemptedAt,
      whatsappBusinessAppHistoryLastError: "Meta did not confirm whether the request was accepted. It will not be retried automatically to avoid a duplicate one-time request.",
    });
    return res.status(502).json({ error: "Meta did not confirm whether history sync started. Refresh the page before trying anything again." });
  }

  if (!sync.ok) {
    await updateSyncSettings(sb, row, {
      whatsappBusinessAppHistoryStatus: "failed",
      whatsappBusinessAppHistoryLastError: sync.error || "Meta refused the history request.",
    });
    return res.status(502).json({ error: `Meta refused the history sync: ${sync.error || "request failed"}` });
  }

  const requestId = typeof sync.json?.request_id === "string" ? sync.json.request_id : null;
  const finalPatch = {
    whatsappBusinessAppHistoryStatus: "requested",
    whatsappBusinessAppHistoryRequestedAt: attemptedAt,
    whatsappBusinessAppHistoryRequestId: requestId,
    whatsappBusinessAppHistoryProgress: 0,
    whatsappBusinessAppHistoryLastError: null,
  };
  const updateError = await updateSyncSettings(sb, row, finalPatch);
  if (updateError) {
    // The starting state already locks out duplicate one-time requests. Meta's
    // webhook still carries the actual history even if this status write fails.
    console.error("[whatsapp-history-sync] Meta accepted the request but status could not be saved", { code: updateError.code || null });
  }
  return res.status(200).json({
    success: true,
    message: "Meta accepted the one-time WhatsApp Business app history request. Messages will appear as history webhooks arrive.",
    historySync: { status: "requested", requestedAt: attemptedAt, requestId, progress: 0 },
  });
}

export default handler;
