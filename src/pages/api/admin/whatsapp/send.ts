/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/whatsapp/send
 *   order  { orderId, key }                            one message about an order
 *   bulk   { templateName, language, variables, preview? }  clients who agreed
 *
 * Both are chosen by a person and go through the business account, so they are
 * logged and respect the block list. Bulk only ever reaches clients who agreed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { normaliseToE164 } from "@/lib/whatsapp";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import { buildPublicQuoteUrlServer } from "@/lib/customerLinksServer";
import {
  WHATSAPP_AUTOMATIONS,
  buildTemplateComponents,
  firstNameOf,
  isValidLanguageCode,
  isValidTemplateName,
  readAutomationSettings,
} from "@/lib/whatsapp/automations";
import { readWhatsAppRules } from "@/lib/whatsapp/rules";
import { callMeta, loadWhatsAppCredentials } from "@/lib/whatsapp/credentials";

const BULK_LIMIT = 500;

async function blockedPhones(sb: any, companyId: string): Promise<Set<string>> {
  const { data } = await sb.from("blocked_contacts").select("phone").eq("company_id", companyId);
  return new Set((data || []).map((row: any) => normaliseToE164(row.phone)).filter(Boolean));
}

async function approvedTemplateError(sb: any, companyId: string, name: string, language: string): Promise<string | null> {
  const credentials = await loadWhatsAppCredentials(sb, companyId);
  if (!credentials) return "Connect WhatsApp again before sending a template.";
  if (!credentials.businessAccountId) return "Reconnect WhatsApp with your Business account ID before sending a template.";
  const result = await callMeta(
    credentials,
    `${credentials.businessAccountId}/message_templates?fields=name,status,language&limit=200`,
  );
  if (!result.ok) return "Could not check template approval with Meta. Refresh the template list and try again.";
  const template = (result.json?.data || []).find((item: any) => item.name === name && item.language === language);
  if (!template) return "This template was not found in WhatsApp Manager. Refresh its saved name in Admin → WhatsApp.";
  if (template.status !== "APPROVED") {
    const status = String(template.status || "pending").toLowerCase().replaceAll("_", " ");
    return `Meta has not approved this template yet. Its status is ${status}.`;
  }
  return null;
}

const RECORD_TEMPLATE_KEYS: Record<"lead" | "quote" | "order", Set<string>> = {
  lead: new Set(["whatsapp_lead_followup", "whatsapp_lead_details", "whatsapp_lead_chase"]),
  quote: new Set(["whatsapp_quote_sent", "whatsapp_quote_chase", "whatsapp_quote_accepted"]),
  order: new Set([
    "whatsapp_order_update",
    "whatsapp_event_week",
    "whatsapp_event_day_morning",
    "whatsapp_order_on_the_way",
    "whatsapp_event_arrived",
    "whatsapp_order_delivered",
  ]),
} as const;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await companyForAdmin(req, res);
  if (!access) return;
  const { companyId, userId } = access;
  const sb: any = getServiceSupabase();

  const { data: integration } = await sb.from("integrations").select("settings, is_active")
    .eq("company_id", companyId).eq("integration_type", "whatsapp").maybeSingle();
  if (!integration?.is_active) return res.status(400).json({ error: "Connect WhatsApp first." });
  const blocked = await blockedPhones(sb, companyId);
  const body = (req.body || {}) as any;

  const action = body.action === "order" ? "record" : body.action;
  const entityType = body.action === "order" ? "order" : String(body.entityType || "");
  const entityId = String(body.action === "order" ? body.orderId || "" : body.entityId || "");

  if (action === "record") {
    if (!(entityType in RECORD_TEMPLATE_KEYS)) return res.status(400).json({ error: "Choose a lead, quote, or order." });
    const typedEntity = entityType as keyof typeof RECORD_TEMPLATE_KEYS;
    const automation = WHATSAPP_AUTOMATIONS.find((item) => item.key === body.key);
    if (!automation || !RECORD_TEMPLATE_KEYS[typedEntity].has(automation.key)) {
      return res.status(400).json({ error: "Choose a message for this record." });
    }
    const setting = readAutomationSettings(integration.settings)[automation.key];
    if (!isValidTemplateName(setting.templateName)) {
      return res.status(400).json({ error: `Add the Meta template name for "${automation.label}" on the WhatsApp page first.` });
    }
    const approvalError = await approvedTemplateError(sb, companyId, setting.templateName, setting.language);
    if (approvalError) return res.status(400).json({ error: approvalError });

    const table = typedEntity === "lead" ? "leads" : typedEntity === "quote" ? "quotes" : "orders";
    const { data: record } = await sb.from(table).select("*")
      .eq("id", entityId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
    if (!record) return res.status(404).json({ error: `${typedEntity[0].toUpperCase()}${typedEntity.slice(1)} not found.` });

    const clientId = record.client_id || record.converted_to_client_id || null;
    let client: any = null;
    if (clientId) {
      const { data } = await sb.from("clients").select("id, client_name, phone, mobile_number, whatsapp_opt_in")
        .eq("id", clientId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      client = data;
    }
    const recipientName = record.client_name || record.contact_name || client?.client_name || "";
    const phone = normaliseToE164(record.client_phone || record.phone || client?.mobile_number || client?.phone);
    if (!phone) return res.status(400).json({ error: "Add a mobile number to this contact first." });
    if (blocked.has(phone)) return res.status(400).json({ error: "This client has opted out of messages." });
    if (client?.whatsapp_opt_in === false) return res.status(400).json({ error: "This contact has opted out of WhatsApp messages." });
    if (readWhatsAppRules(integration.settings).requireConsent && client?.whatsapp_opt_in !== true) {
      return res.status(400).json({ error: "Record the contact's WhatsApp consent before sending." });
    }

    const { data: company } = await sb.from("companies").select("company_name, slug").eq("id", companyId).maybeSingle();
    const values: Record<string, string> = {
      first_name: firstNameOf(recipientName),
      event_name: record.event_name || record.quote_name || record.event_type || "your event",
      company_name: company?.company_name || "",
      quote_url: buildPublicQuoteUrlServer(record.public_token, company?.slug) || "",
    };
    if (automation.slots.includes("quote_url") && !values.quote_url) {
      return res.status(400).json({ error: "Create the public quote link before sending this template." });
    }
    const { error } = await sb.from("whatsapp_messages").insert({
      company_id: companyId,
      recipient_phone: phone,
      recipient_name: recipientName,
      message_type: "template",
      template_name: setting.templateName,
      template_language: setting.language,
      template_params: { components: buildTemplateComponents(automation.slots.map((slot) => values[slot])) },
      status: "pending",
      related_entity_type: typedEntity,
      related_entity_id: record.id,
      dedup_key: `manual:${automation.key}:${typedEntity}:${record.id}:${new Date().toISOString().slice(0, 10)}`,
      enqueued_by: userId,
    });
    if (error && String(error.code) === "23505") return res.status(400).json({ error: "This message was already queued for this record today." });
    if (error) throw error;
    return res.status(200).json({ success: true });
  }

  if (body.action === "bulk") {
    const templateName = String(body.templateName || "");
    const language = String(body.language || "en");
    const variables = Number(body.variables || 0);
    if (!isValidTemplateName(templateName) || !isValidLanguageCode(language)) return res.status(400).json({ error: "Choose an approved template." });
    if (variables > 1) return res.status(400).json({ error: "Bulk messages can only use one variable, the client's first name." });

    const { data: clients, error } = await sb.from("clients").select("id, client_name, phone, mobile_number")
      .eq("company_id", companyId).eq("whatsapp_opt_in", true).is("deleted_at", null).limit(BULK_LIMIT + 1);
    if (error) return res.status(400).json({ error: "Client consent isn't set up yet." });
    if ((clients || []).length > BULK_LIMIT) return res.status(400).json({ error: `Bulk messages are limited to ${BULK_LIMIT} clients at a time.` });

    const seen = new Set<string>();
    const recipients = (clients || []).flatMap((client: any) => {
      const phone = normaliseToE164(client.mobile_number || client.phone);
      if (!phone || blocked.has(phone) || seen.has(phone)) return [];
      seen.add(phone);
      return [{ client, phone }];
    });
    if (body.preview) return res.status(200).json({ recipients: recipients.length });

    const day = new Date().toISOString().slice(0, 10);
    let queued = 0;
    for (const { client, phone } of recipients) {
      const { error: insertError } = await sb.from("whatsapp_messages").insert({
        company_id: companyId,
        recipient_phone: phone,
        recipient_name: client.client_name,
        message_type: "template",
        template_name: templateName,
        template_language: language,
        template_params: { components: variables === 1 ? buildTemplateComponents([firstNameOf(client.client_name)]) : [] },
        status: "pending",
        related_entity_type: "client",
        related_entity_id: client.id,
        dedup_key: `bulk:${templateName}:${day}:${phone}`,
        enqueued_by: userId,
      });
      if (!insertError) queued += 1;
    }
    console.info("[whatsapp/send] bulk queued", { queued, recipients: recipients.length });
    return res.status(200).json({ success: true, queued });
  }

  return res.status(400).json({ error: "Unknown action" });
}

export default withApiLogging(handler);
