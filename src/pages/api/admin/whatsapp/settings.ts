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
  encryptWhatsAppToken,
  loadWhatsAppCredentials,
  postWhatsAppMessage,
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
      webhookVerifyToken: row?.is_active ? row?.settings?.webhookVerifyToken || null : null,
    });
  }

  const body = (req.body || {}) as any;

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
    const check = await verifyWhatsAppCredentials(phoneNumberId, accessToken);
    if (!check.ok) return res.status(400).json({ error: "Meta didn't accept these details. Check the Phone number ID and access token." });

    const existing = await loadRow(sb, companyId);
    const connectionRow = {
      company_id: companyId,
      user_id: userId,
      integration_type: "whatsapp",
      credentials: {
        phoneNumberId,
        businessAccountId,
        accessTokenEncrypted: encryptWhatsAppToken(accessToken),
        appSecretEncrypted: encryptWhatsAppToken(appSecret),
      },
      settings: {
        ...(existing?.settings || {}),
        displayNumber: check.displayNumber || null,
        attention: null,
        webhookVerifyToken: existing?.settings?.webhookVerifyToken || crypto.randomBytes(24).toString("hex"),
      },
      is_active: true,
      status: "connected",
      connected_at: new Date().toISOString(),
    };
    // The database has a partial unique index on (company_id, integration_type).
    // PostgREST's onConflict cannot specify its WHERE clause, so an upsert on
    // those columns fails with 42P10. Update the existing row or insert it.
    let { error } = existing
      ? await sb.from("integrations").update(connectionRow).eq("id", existing.id).eq("company_id", companyId)
      : await sb.from("integrations").insert(connectionRow);
    if (error?.code === "23505" && !existing) {
      // Another request created the row after loadRow; use that row instead.
      const concurrent = await loadRow(sb, companyId);
      if (concurrent) {
        ({ error } = await sb.from("integrations").update(connectionRow).eq("id", concurrent.id).eq("company_id", companyId));
      }
    }
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (body.action === "disconnect") {
    // Removes the token and turns every message off, so reconnecting later
    // sends nothing until the company chooses again.
    const { error } = await sb.from("integrations")
      .update({ is_active: false, status: "disconnected", credentials: {}, settings: {} })
      .eq("company_id", companyId).eq("integration_type", "whatsapp");
    if (error) throw error;
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
    const credentials = await loadWhatsAppCredentials(sb, companyId);
    if (!credentials) return res.status(400).json({ error: "Connect WhatsApp first." });
    const sample: Record<string, string> = {
      first_name: "Sam", event_name: "Sample event", company_name: "Your company", quote_url: "https://cateringms.com",
    };
    const result = await postWhatsAppMessage(credentials, {
      to,
      type: "template",
      template: {
        name: setting.templateName,
        language: { code: setting.language },
        components: buildTemplateComponents(automation.slots.map((slot) => sample[slot])),
      },
    });
    if (!result.ok) return res.status(400).json({ error: `Meta refused the test: ${result.error}` });
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: "Unknown action" });
}

export default withApiLogging(handler);
