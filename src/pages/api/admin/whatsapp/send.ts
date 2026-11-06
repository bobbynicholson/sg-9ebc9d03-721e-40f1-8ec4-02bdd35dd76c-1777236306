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
import {
  WHATSAPP_AUTOMATIONS,
  buildTemplateComponents,
  firstNameOf,
  isValidLanguageCode,
  isValidTemplateName,
  readAutomationSettings,
} from "@/lib/whatsapp/automations";

const BULK_LIMIT = 500;

async function blockedPhones(sb: any, companyId: string): Promise<Set<string>> {
  const { data } = await sb.from("blocked_contacts").select("phone").eq("company_id", companyId);
  return new Set((data || []).map((row: any) => normaliseToE164(row.phone)).filter(Boolean));
}

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

  if (body.action === "order") {
    const automation = WHATSAPP_AUTOMATIONS.find((item) => item.key === body.key);
    if (!automation || automation.slots.includes("quote_url") || automation.group === "Staff") {
      return res.status(400).json({ error: "Choose a message for this order." });
    }
    const setting = readAutomationSettings(integration.settings)[automation.key];
    if (!isValidTemplateName(setting.templateName)) {
      return res.status(400).json({ error: `Add the Meta template name for "${automation.label}" on the WhatsApp page first.` });
    }
    const { data: order } = await sb.from("orders")
      .select("id, client_name, client_phone, event_name, clients:client_id (phone, mobile_number)")
      .eq("id", String(body.orderId || "")).eq("company_id", companyId).maybeSingle();
    if (!order) return res.status(404).json({ error: "Order not found." });
    const phone = normaliseToE164(order.client_phone || order.clients?.mobile_number || order.clients?.phone);
    if (!phone) return res.status(400).json({ error: "Add a mobile number to this client first." });
    if (blocked.has(phone)) return res.status(400).json({ error: "This client has opted out of messages." });

    const { data: company } = await sb.from("companies").select("company_name").eq("id", companyId).maybeSingle();
    const values: Record<string, string> = {
      first_name: firstNameOf(order.client_name),
      event_name: order.event_name || "your event",
      company_name: company?.company_name || "",
    };
    const { error } = await sb.from("whatsapp_messages").insert({
      company_id: companyId,
      recipient_phone: phone,
      recipient_name: order.client_name,
      message_type: "template",
      template_name: setting.templateName,
      template_language: setting.language,
      template_params: { components: buildTemplateComponents(automation.slots.map((slot) => values[slot])) },
      status: "pending",
      related_entity_type: "order",
      related_entity_id: order.id,
      dedup_key: `manual:${automation.key}:${order.id}:${new Date().toISOString().slice(0, 10)}`,
      enqueued_by: userId,
    });
    if (error && String(error.code) === "23505") return res.status(400).json({ error: "This message was already sent for this order today." });
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
