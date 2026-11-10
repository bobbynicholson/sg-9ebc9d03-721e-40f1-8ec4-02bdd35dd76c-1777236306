/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET  /api/admin/whatsapp/settings            connection, messages and rules
 * POST /api/admin/whatsapp/settings            { action, ... }
 *   connect     { phoneNumberId, businessAccountId, accessToken }
 *   disconnect
 *   save        { automations }
 *   test        { key, phone }
 *
 * Company admins only. The access token is checked with Meta, stored
 * encrypted and never returned.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { normaliseToE164 } from "@/lib/whatsapp";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import { readWhatsAppRules } from "@/lib/whatsapp/rules";
import {
  WHATSAPP_AUTOMATIONS,
  applyAutomationChanges,
  buildTemplateComponents,
  isValidLanguageCode,
  isValidTemplateName,
  readAutomationSettings,
  wordingProblem,
  type WhatsAppAutomationKey,
} from "@/lib/whatsapp/automations";
import {
  canStoreWhatsAppToken,
  callMeta,
  hasWhatsAppWebhookVerifyToken,
  isWhatsAppCredentialVaultAvailable,
  loadWhatsAppWebhookVerifyToken,
  loadWhatsAppCredentials,
  postWhatsAppMessage,
  storeWhatsAppCredentials,
  storeWhatsAppVerifyToken,
  verifyWhatsAppCredentials,
} from "@/lib/whatsapp/credentials";

async function loadRow(sb: any, companyId: string) {
  const { data, error } = await sb.from("integrations").select("id, credentials, settings, is_active, connected_at, status")
    .eq("company_id", companyId).eq("integration_type", "whatsapp").maybeSingle();
  if (error) throw error;
  return data;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await companyForAdmin(req, res);
  if (!access) return;
  const { companyId, userId } = access;
  const sb: any = getServiceSupabase();

  if (req.method === "GET") {
    const row = await loadRow(sb, companyId);
    res.setHeader("Cache-Control", "no-store");
    const revealVerifyToken = req.query.revealToken === "1";
    if (row?.is_active && revealVerifyToken && !canStoreWhatsAppToken()) {
      return res.status(503).json({
        error: "WhatsApp credential encryption is misconfigured. Set the existing 32-byte hex or base64 key in the server environment; a new key cannot decrypt saved credentials.",
      });
    }
    const verifyToken = row?.is_active && revealVerifyToken
      ? await loadWhatsAppWebhookVerifyToken(sb, companyId, row.settings) : null;
    const verifyTokenAvailable = !!(row?.is_active && await hasWhatsAppWebhookVerifyToken(sb, companyId, row.settings));
    return res.status(200).json({
      connected: !!row?.is_active,
      connectedAt: row?.connected_at || null,
      phoneNumberId: row?.is_active ? row?.credentials?.phoneNumberId || null : null,
      businessAccountId: row?.is_active ? row?.credentials?.businessAccountId || null : null,
      displayNumber: row?.is_active ? row?.settings?.displayNumber || null : null,
      canConnect: canStoreWhatsAppToken(),
      automations: readAutomationSettings(row?.settings),
      rules: readWhatsAppRules(row?.settings),
      attention: row?.is_active ? row?.settings?.attention || null : null,
      webhookUrl: `https://${req.headers.host || "cateringms.com"}/api/webhooks/whatsapp`,
      // Fetch only when the admin chooses Show or Copy; do not include the
      // verify token in every routine page load.
      webhookVerifyToken: revealVerifyToken ? verifyToken : null,
      verifyTokenAvailable,
      webhookVerifiedAt: row?.is_active ? row?.settings?.webhookVerifiedAt || null : null,
    });
  }

  const body = (req.body || {}) as any;

  if (body.action === "rotate_verify_token") {
    if (!canStoreWhatsAppToken()) return res.status(503).json({ error: "Set a strong ENCRYPTION_KEY before changing the verify token." });
    const row = await loadRow(sb, companyId);
    if (!row?.is_active) return res.status(400).json({ error: "Connect WhatsApp before replacing the verify token." });
    const verifyToken = crypto.randomBytes(24).toString("hex");
    const { webhookVerifyToken: _legacyVerifyToken, webhookVerifyTokenEncrypted: _legacyEncryptedToken,
      webhookVerifyTokenHash: _legacyTokenHash, ...safeSettings } = row.settings || {};
    await storeWhatsAppVerifyToken(sb, row.id, verifyToken);
    const { error } = await sb.from("integrations").update({
      settings: {
        ...safeSettings,
        webhookVerifiedAt: null,
      },
    }).eq("id", row.id).eq("company_id", companyId);
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (body.action === "connect") {
    const phoneNumberId = String(body.phoneNumberId || "").trim();
    const businessAccountId = String(body.businessAccountId || "").trim();
    const accessToken = String(body.accessToken || "").trim();
    const appSecret = String(body.appSecret || "").trim();
    if (!/^\d+$/.test(phoneNumberId) || !/^\d+$/.test(businessAccountId) || !accessToken || !appSecret) {
      return res.status(400).json({ error: "Enter the Phone number ID, WhatsApp Business account ID, access token and App secret from Meta." });
    }
    if (!canStoreWhatsAppToken()) {
      return res.status(503).json({ error: "WhatsApp can't be connected from here. Connect it on the live site." });
    }
    if (!await isWhatsAppCredentialVaultAvailable(sb)) {
      return res.status(503).json({ error: "WhatsApp's secure credential vault is being prepared. Try again after the database migration is applied." });
    }
    const check = await verifyWhatsAppCredentials(phoneNumberId, accessToken);
    if (!check.ok) return res.status(400).json({ error: "Meta didn't accept these details. Check the Phone number ID and access token." });

    const existing = await loadRow(sb, companyId);
    const priorVerifyToken = existing
      ? await loadWhatsAppWebhookVerifyToken(sb, companyId, existing.settings) : null;
    const verifyToken = priorVerifyToken || crypto.randomBytes(24).toString("hex");
    const { webhookVerifyToken: _legacyVerifyToken, webhookVerifyTokenEncrypted: _legacyEncryptedToken,
      webhookVerifyTokenHash: _legacyTokenHash, ...safeSettings } = existing?.settings || {};
    const connectionRow = {
      company_id: companyId,
      user_id: userId,
      integration_type: "whatsapp",
      credentials: { phoneNumberId, businessAccountId },
      settings: {
        ...safeSettings,
        displayNumber: check.displayNumber || null,
        attention: null,
        webhookVerifiedAt: existing?.settings?.webhookVerifiedAt || null,
      },
      is_active: true,
      status: "connected",
      connected_at: new Date().toISOString(),
    };
    // The database has a partial unique index on (company_id, integration_type).
    // PostgREST's onConflict cannot specify its WHERE clause, so an upsert on
    // those columns fails with 42P10. Update the existing row or insert it.
    let previousRow = existing;
    let { error } = existing
      ? await sb.from("integrations").update(connectionRow).eq("id", existing.id).eq("company_id", companyId)
      : await sb.from("integrations").insert(connectionRow);
    if (error?.code === "23505" && !existing) {
      // Another request created the row after loadRow; use that row instead.
      const concurrent = await loadRow(sb, companyId);
      if (concurrent) {
        previousRow = concurrent;
        ({ error } = await sb.from("integrations").update(connectionRow).eq("id", concurrent.id).eq("company_id", companyId));
      }
    }
    if (error) throw error;
    const saved = await loadRow(sb, companyId);
    if (!saved?.id) throw new Error("WhatsApp integration was saved without an integration id");
    try {
      await storeWhatsAppCredentials(sb, saved.id, companyId, { accessToken, appSecret, verifyToken });
    } catch (vaultError) {
      // Restore the prior integration row if storing credentials failed. This
      // keeps a transient vault error from disconnecting an existing account.
      if (previousRow) {
        await sb.from("integrations").update({
          credentials: previousRow.credentials || {},
          settings: previousRow.settings || {},
          is_active: !!previousRow.is_active,
          ...(previousRow.status ? { status: previousRow.status } : {}),
          ...(previousRow.connected_at ? { connected_at: previousRow.connected_at } : {}),
        }).eq("id", saved.id).eq("company_id", companyId);
      } else {
        await sb.from("integrations").delete().eq("id", saved.id).eq("company_id", companyId);
      }
      throw vaultError;
    }
    return res.status(200).json({ success: true });
  }

  if (body.action === "disconnect") {
    // Removes the token and turns every message off, so reconnecting later
    // sends nothing until the company chooses again.
    const row = await loadRow(sb, companyId);
    const { error } = await sb.from("integrations")
      .update({ is_active: false, status: "disconnected", credentials: {}, settings: {} })
      .eq("company_id", companyId).eq("integration_type", "whatsapp");
    if (error) throw error;
    if (row?.id) {
      const { error: vaultError } = await sb.from("whatsapp_credential_vault").delete().eq("integration_id", row.id);
      if (vaultError) throw vaultError;
    }
    // Otherwise reconnecting later would suddenly send old messages.
    await sb.from("whatsapp_messages").update({ status: "cancelled", failure_reason: "WhatsApp was disconnected" })
      .eq("company_id", companyId).in("status", ["pending", "sending"]);
    return res.status(200).json({ success: true });
  }

  if (body.action === "save") {
    const row = await loadRow(sb, companyId);
    if (!row?.is_active) return res.status(400).json({ error: "Connect WhatsApp before choosing messages." });
    const incoming = (body.automations || {}) as Record<string, { enabled?: boolean; templateName?: string; language?: string; wording?: string }>;
    for (const automation of WHATSAPP_AUTOMATIONS) {
      const change = incoming[automation.key];
      if (!change) continue;
      const name = String(change.templateName ?? "").trim();
      if (change.enabled && !isValidTemplateName(name)) {
        return res.status(400).json({ error: `Add the approved Meta template name for "${automation.label}" before turning it on. Use lowercase letters, numbers and underscores.` });
      }
      const problem = wordingProblem(automation, String(change.wording ?? ""));
      if (problem) return res.status(400).json({ error: `${automation.label}: ${problem}` });
      if (change.language && !isValidLanguageCode(String(change.language).trim())) {
        return res.status(400).json({ error: `Check the language code for "${automation.label}", for example en or en_US.` });
      }
    }
    const automations = applyAutomationChanges(readAutomationSettings(row.settings), incoming, new Date().toISOString());
    const rules = readWhatsAppRules({ rules: body.rules ?? row.settings?.rules });
    const { error } = await sb.from("integrations").update({ settings: { ...(row.settings || {}), automations, rules } }).eq("id", row.id);
    if (error) throw error;
    return res.status(200).json({ success: true, automations });
  }

  if (body.action === "test") {
    const automation = WHATSAPP_AUTOMATIONS.find((item) => item.key === (body.key as WhatsAppAutomationKey));
    const to = normaliseToE164(String(body.phone || ""));
    if (!automation || !to) return res.status(400).json({ error: "Enter the mobile number to send the test to." });
    const row = await loadRow(sb, companyId);
    const setting = readAutomationSettings(row?.settings)[automation.key];
    if (!isValidTemplateName(setting.templateName)) {
      return res.status(400).json({ error: `Save the Meta template name for "${automation.label}" first.` });
    }
    if (!canStoreWhatsAppToken()) {
      return res.status(503).json({
        error: "WhatsApp credential encryption is misconfigured. Set the existing 32-byte hex or base64 key in the server environment; a new key cannot decrypt saved credentials.",
      });
    }
    const credentials = await loadWhatsAppCredentials(sb, companyId);
    if (!credentials) return res.status(400).json({ error: "Connect WhatsApp first." });
    if (!credentials.businessAccountId) return res.status(400).json({ error: "Reconnect WhatsApp with your Business account ID." });
    const templates = await callMeta(credentials, `${credentials.businessAccountId}/message_templates?fields=name,status,language&limit=200`);
    if (!templates.ok) return res.status(400).json({ error: "Could not check template approval with Meta. Refresh and try again." });
    const approved = (templates.json?.data || []).some((item: any) =>
      item.name === setting.templateName && item.language === setting.language && item.status === "APPROVED",
    );
    if (!approved) return res.status(400).json({ error: `Meta has not approved "${automation.label}" yet.` });
    const sample: Record<string, string> = {
      first_name: "Sam", event_name: "Sample event", company_name: "Your company", quote_url: "https://cateringms.com", lead_url: "https://cateringms.com/admin/leads?leadId=sample",
      task_title: "Wash the uniforms", task_date: "12 December", task_time: "9:00 AM",
      task_dashboard_url: "https://cateringms.com/team-portal/cleaning/tasks",
    };
    const templateParams = buildTemplateComponents(automation.slots.map((slot) => sample[slot]));
    const result = await postWhatsAppMessage(credentials, {
      to,
      type: "template",
      template: {
        name: setting.templateName,
        language: { code: setting.language },
        components: templateParams,
      },
    });
    const providerBody = result.response && typeof result.response === "object"
      ? result.response as Record<string, any>
      : {};
    const providerError = providerBody.error && typeof providerBody.error === "object" ? providerBody.error : null;
    const maskedRecipient = `***${to.slice(-4)}`;
    const redactPhone = (value: unknown) => {
      if (typeof value !== "string") return value ?? null;
      return value.replaceAll(to, maskedRecipient).replaceAll(`+${to}`, maskedRecipient);
    };
    console.info("[whatsapp-test] Meta send response", {
      accepted: result.ok,
      providerHttpStatus: result.httpStatus,
      recipient: maskedRecipient,
      templateName: setting.templateName,
      language: setting.language,
      messageIdSuffix: result.id?.slice(-12) || null,
      error: providerError ? {
        code: providerError.code ?? null,
        subcode: providerError.error_subcode ?? null,
        type: providerError.type ?? null,
        title: redactPhone(providerError.error_user_title || providerError.title),
        message: redactPhone(providerError.error_user_msg || providerError.message),
        details: redactPhone(providerError.error_data?.details),
        fbtraceId: providerError.fbtrace_id ?? null,
      } : null,
    });
    if (!result.ok) {
      const responseError = providerError || {};
      const providerCode = responseError.code ? String(responseError.code) : null;
      const providerMessage = redactPhone(responseError.error_user_msg || responseError.message || result.error || "Meta did not provide a reason.");
      const providerTitle = redactPhone(responseError.error_user_title || responseError.title || "");
      const providerDetails = redactPhone(responseError.error_data?.details);
      const diagnostic = [
        providerCode ? `Meta ${providerCode}` : null,
        responseError.error_subcode ? `Subcode ${responseError.error_subcode}` : null,
        providerTitle && providerTitle !== providerMessage ? providerTitle : null,
        providerMessage,
        typeof providerDetails === "string" && providerDetails && providerDetails !== providerMessage ? providerDetails : null,
        responseError.fbtrace_id ? `Meta reference ${responseError.fbtrace_id}` : null,
      ].filter(Boolean).join(": ");
      const { error: trackingError } = await sb.from("whatsapp_messages").insert({
        company_id: companyId,
        recipient_phone: to,
        message_type: "template",
        template_name: setting.templateName,
        template_language: setting.language,
        template_params: { components: templateParams },
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: diagnostic,
        gateway_response: result.response,
        dedup_key: `test:${crypto.randomUUID()}`,
        enqueued_by: userId,
      });
      if (trackingError) console.error("[whatsapp-test] Failed-test tracking insert failed", { code: trackingError.code || null });
      return res.status(400).json({ error: `Meta refused the test: ${diagnostic}` });
    }

    // A 200 from Meta means accepted, not delivered. Keep the returned wamid
    // so the messages webhook can advance this test to delivered/read/failed.
    const { error: trackingError } = await sb.from("whatsapp_messages").insert({
      company_id: companyId,
      recipient_phone: to,
      message_type: "template",
      template_name: setting.templateName,
      template_language: setting.language,
      template_params: { components: templateParams },
      status: "sent",
      sent_at: new Date().toISOString(),
      gateway_message_id: result.id,
      gateway_response: result.response,
      dedup_key: `test:${crypto.randomUUID()}`,
      enqueued_by: userId,
    });
    if (trackingError) {
      console.error("[whatsapp-test] Tracking insert failed", { code: trackingError.code || null });
      return res.status(200).json({
        success: true,
        message: "Meta accepted the test, but CateringMS couldn't record its delivery status. Check the destination phone directly.",
      });
    }
    console.info("[whatsapp-test] Delivery tracking row saved", {
      recipient: maskedRecipient,
      messageIdSuffix: result.id?.slice(-12) || null,
    });
    return res.status(200).json({
      success: true,
      message: result.id
        ? "Meta accepted the test. Delivery status will appear in WhatsApp Activity."
        : "Meta accepted the test but returned no message ID, so delivery can't be tracked.",
    });
  }

  return res.status(400).json({ error: "Unknown action" });
}

export default withApiLogging(handler);
