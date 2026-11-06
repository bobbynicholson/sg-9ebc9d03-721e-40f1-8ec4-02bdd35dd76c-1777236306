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
import { buildAdminLeadUrlServer, buildPublicQuoteUrlServer } from "@/lib/customerLinksServer";
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
  const { data, error } = await sb.from("blocked_contacts").select("phone").eq("company_id", companyId);
  if (error) throw error;
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

const RECORD_TEMPLATE_KEYS: Record<string, Set<string>> = {
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
  client: new Set(["whatsapp_touch_base"]),
  staff: new Set(["whatsapp_staff_welcome_login"]),
  driver_shift: new Set(["whatsapp_staff_shift_confirm"]),
  kitchen_shift: new Set(["whatsapp_staff_shift_confirm"]),
  staff_order: new Set(["whatsapp_staff_job_assigned", "whatsapp_staff_pickup_ready"]),
  lead_admin: new Set(["embed_lead_admin_whatsapp"]),
} as const;

const STAFF_ROLES = new Set([
  "kitchen_manager", "kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_manager", "cleaning_staff",
]);
const ADMIN_ROLES = ["owner", "company_admin", "admin"];

function shiftDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`));
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

  const action = body.action === "order" ? "record" : body.action;
  const entityType = body.action === "order" ? "order" : String(body.entityType || "");
  const entityId = String(body.action === "order" ? body.orderId || "" : body.entityId || "");

  if (action === "record") {
    if (!Object.prototype.hasOwnProperty.call(RECORD_TEMPLATE_KEYS, entityType)) {
      return res.status(400).json({ error: "Choose a lead, quote, order, contact, staff member, or shift." });
    }
    const typedEntity = entityType as keyof typeof RECORD_TEMPLATE_KEYS;
    const automation = WHATSAPP_AUTOMATIONS.find((item) => item.key === body.key);
    if (!automation || !RECORD_TEMPLATE_KEYS[typedEntity]?.has(automation.key)) {
      return res.status(400).json({ error: "Choose a message for this record." });
    }
    const setting = readAutomationSettings(integration.settings)[automation.key];
    if (!isValidTemplateName(setting.templateName) || !isValidLanguageCode(setting.language)) {
      return res.status(400).json({ error: `Add the Meta template name for "${automation.label}" on the WhatsApp page first.` });
    }
    const approvalError = await approvedTemplateError(sb, companyId, setting.templateName, setting.language);
    if (approvalError) return res.status(400).json({ error: approvalError });

    const { data: company } = await sb.from("companies").select("company_name, slug").eq("id", companyId).maybeSingle();
    if (typedEntity === "lead_admin") {
      const { data: lead } = await sb.from("leads").select("id, source, client_name, contact_name, event_type")
        .eq("id", entityId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      if (!lead) return res.status(404).json({ error: "Lead not found." });
      if (lead.source !== "embed") return res.status(400).json({ error: "This alert is only for website-form enquiries." });
      const { data: admins } = await sb.from("profiles")
        .select("id, full_name, phone_number, mobile_number, whatsapp_opt_in")
        .eq("company_id", companyId).in("role", ADMIN_ROLES);
      const leadUrl = buildAdminLeadUrlServer(lead.id, company?.slug) || "";
      const eventName = lead.event_type || lead.client_name || lead.contact_name || "a new enquiry";
      const day = new Date().toISOString().slice(0, 10);
      const seenPhones = new Set<string>();
      let queued = 0;
      for (const admin of admins || []) {
        const phone = normaliseToE164(admin.mobile_number || admin.phone_number);
        if (!phone || blocked.has(phone) || seenPhones.has(phone) || admin.whatsapp_opt_in === false) continue;
        seenPhones.add(phone);
        const values: Record<string, string> = {
          first_name: firstNameOf(admin.full_name),
          event_name: eventName,
          company_name: company?.company_name || "",
          quote_url: "",
          lead_url: leadUrl,
        };
        const { error } = await sb.from("whatsapp_messages").insert({
          company_id: companyId,
          recipient_phone: phone,
          recipient_name: admin.full_name,
          message_type: "template",
          template_name: setting.templateName,
          template_language: setting.language,
          template_params: { components: buildTemplateComponents(automation.slots.map((slot) => values[slot])) },
          status: "pending",
          related_entity_type: "lead",
          related_entity_id: lead.id,
          dedup_key: `manual:${automation.key}:lead:${lead.id}:${admin.id}:${day}`,
          enqueued_by: userId,
        });
        if (!error) queued += 1;
        else if (String(error.code) !== "23505") throw error;
      }
      if (queued === 0) return res.status(400).json({ error: "No opted-in admin has a usable WhatsApp number." });
      return res.status(200).json({ success: true, queued });
    }

    let record: any = null;
    let recipient: any = null;
    let clientConsent: any = null;
    let recipientName = "";
    let phoneSource: string | null = null;
    let eventName = "";
    let relatedEntityType = typedEntity;
    let relatedEntityId = entityId;

    if (typedEntity === "lead" || typedEntity === "quote" || typedEntity === "order") {
      const table = typedEntity === "lead" ? "leads" : typedEntity === "quote" ? "quotes" : "orders";
      const { data } = await sb.from(table).select("*")
        .eq("id", entityId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      record = data;
      if (!record) return res.status(404).json({ error: `${typedEntity[0].toUpperCase()}${typedEntity.slice(1)} not found.` });
      const clientId = record.client_id || record.converted_to_client_id || null;
      if (clientId) {
        const { data: client } = await sb.from("clients").select("id, client_name, phone, mobile_number, whatsapp_opt_in")
          .eq("id", clientId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
        clientConsent = client;
      }
      recipient = clientConsent;
      recipientName = record.client_name || record.contact_name || clientConsent?.client_name || "";
      phoneSource = record.client_phone || record.phone || clientConsent?.mobile_number || clientConsent?.phone;
      eventName = record.event_name || record.quote_name || record.event_type || "your event";
    } else if (typedEntity === "client") {
      const { data } = await sb.from("clients").select("id, client_name, phone, mobile_number, whatsapp_opt_in")
        .eq("id", entityId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      record = data;
      if (!record) return res.status(404).json({ error: "Contact not found." });
      clientConsent = record;
      recipient = record;
      recipientName = record.client_name || "";
      phoneSource = record.mobile_number || record.phone;
    } else if (typedEntity === "staff") {
      const { data } = await sb.from("profiles")
        .select("id, full_name, phone_number, mobile_number, whatsapp_opt_in, role, active_role, is_active")
        .eq("id", entityId).eq("company_id", companyId).maybeSingle();
      record = data;
      if (!record) return res.status(404).json({ error: "Staff profile not found." });
      if (record.is_active === false) return res.status(400).json({ error: "Reactivate this staff login before sending a welcome." });
      if (!STAFF_ROLES.has(String(record.role)) && !STAFF_ROLES.has(String(record.active_role))) {
        return res.status(400).json({ error: "The welcome template is only for staff accounts." });
      }
      recipient = record;
      recipientName = record.full_name || "";
      phoneSource = record.mobile_number || record.phone_number;
    } else if (typedEntity === "driver_shift" || typedEntity === "kitchen_shift") {
      const table = typedEntity === "driver_shift" ? "driver_shifts" : "kitchen_shifts";
      const columns = typedEntity === "driver_shift" ? "id, driver_id, shift_date" : "id, staff_id, shift_date";
      const { data } = await sb.from(table).select(columns)
        .eq("id", entityId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      record = data;
      if (!record) return res.status(404).json({ error: "Shift not found." });
      const staffId = typedEntity === "driver_shift" ? record.driver_id : record.staff_id;
      if (!staffId) return res.status(400).json({ error: "This shift has no linked staff login." });
      const { data: profile } = await sb.from("profiles")
        .select("id, full_name, phone_number, mobile_number, whatsapp_opt_in, role, active_role")
        .eq("id", staffId).eq("company_id", companyId).maybeSingle();
      if (!profile) return res.status(404).json({ error: "The staff login for this shift was not found." });
      if (!STAFF_ROLES.has(String(profile.role)) && !STAFF_ROLES.has(String(profile.active_role))) {
        return res.status(400).json({ error: "This shift is not linked to a staff account." });
      }
      recipient = profile;
      recipientName = profile.full_name || "";
      phoneSource = profile.mobile_number || profile.phone_number;
      eventName = shiftDateLabel(record.shift_date);
    } else if (typedEntity === "staff_order") {
      const { data: order } = await sb.from("orders").select("id, event_name, order_number, ready_at, assigned_driver_id, secondary_driver_id")
        .eq("id", entityId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      if (!order) return res.status(404).json({ error: "Order not found." });
      const staffId = String(body.recipientId || "");
      if (!staffId) return res.status(400).json({ error: "Choose the assigned driver first." });
      const assigned = [order.assigned_driver_id, order.secondary_driver_id].includes(staffId);
      const { data: assignment } = assigned ? { data: null } : await sb.from("driver_assignments").select("id")
        .eq("company_id", companyId).eq("order_id", order.id).eq("driver_id", staffId).limit(1).maybeSingle();
      if (!assigned && !assignment) return res.status(403).json({ error: "This driver is not assigned to the order." });
      if (automation.key === "whatsapp_staff_pickup_ready" && !order.ready_at) {
        return res.status(400).json({ error: "Mark the order ready before sending the pickup message." });
      }
      const { data: profile } = await sb.from("profiles")
        .select("id, full_name, phone_number, mobile_number, whatsapp_opt_in, role, active_role")
        .eq("id", staffId).eq("company_id", companyId).maybeSingle();
      if (!profile) return res.status(404).json({ error: "Assigned driver not found." });
      if (!STAFF_ROLES.has(String(profile.role)) && !STAFF_ROLES.has(String(profile.active_role))) {
        return res.status(400).json({ error: "The selected order assignee is not a staff account." });
      }
      record = order;
      recipient = profile;
      recipientName = profile.full_name || "";
      phoneSource = profile.mobile_number || profile.phone_number;
      eventName = order.event_name || order.order_number || "your order";
      relatedEntityType = "order";
      relatedEntityId = order.id;
    }

    const phone = normaliseToE164(phoneSource);
    if (!phone) return res.status(400).json({ error: "Add a mobile number to this contact first." });
    if (blocked.has(phone)) return res.status(400).json({ error: "This person has opted out of messages." });
    if (recipient?.whatsapp_opt_in === false) return res.status(400).json({ error: "This person has opted out of WhatsApp messages." });
    const clientMessage = typedEntity === "lead" || typedEntity === "quote" || typedEntity === "order" || typedEntity === "client";
    if (clientMessage && readWhatsAppRules(integration.settings).requireConsent && clientConsent?.whatsapp_opt_in !== true) {
      return res.status(400).json({ error: "Record the contact's WhatsApp consent before sending." });
    }

    const values: Record<string, string> = {
      first_name: firstNameOf(recipientName),
      event_name: eventName || "your event",
      company_name: company?.company_name || "",
      quote_url: buildPublicQuoteUrlServer(record?.public_token, company?.slug) || "",
      lead_url: "",
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
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
      dedup_key: `manual:${automation.key}:${typedEntity}:${relatedEntityId}:${recipient?.id || phone}:${new Date().toISOString().slice(0, 10)}`,
      enqueued_by: userId,
    });
    if (error && String(error.code) === "23505") return res.status(400).json({ error: "This message was already queued for this record today." });
    if (error) throw error;
    return res.status(200).json({ success: true, queued: 1 });
  }

  if (body.action === "bulk") {
    const templateName = String(body.templateName || "");
    const language = String(body.language || "en");
    const variables = Number(body.variables || 0);
    if (!isValidTemplateName(templateName) || !isValidLanguageCode(language)) return res.status(400).json({ error: "Choose an approved template." });
    if (variables > 1) return res.status(400).json({ error: "Bulk messages can only use one variable, the client's first name." });
    const approvalError = await approvedTemplateError(sb, companyId, templateName, language);
    if (approvalError) return res.status(400).json({ error: approvalError });

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
