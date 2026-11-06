/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Finds what happened since the last run and queues the WhatsApp messages
 * each company has turned on. /api/cron/whatsapp-drain then sends them.
 *
 * Safety rules:
 *   - Only messages turned on with an approved template are considered.
 *   - Nothing from before a message was turned on is ever sent.
 *   - dedup_key means a client gets each message once per quote or order.
 *   - Blocked contacts and paused leads, orders or clients are skipped.
 *   - Staff who turned WhatsApp off on their profile are skipped.
 *   - Quiet hours, the weekly limit and consent rules are applied. A message
 *     held back by quiet hours or the limit goes out on a later run.
 *   - Follow-ups stop once the person has replied.
 */
import { buildPublicQuoteUrlServer } from "@/lib/customerLinksServer";
import { normaliseToE164 } from "@/lib/whatsapp";
import {
  CLIENT_KEYS,
  FOLLOW_UP_KEYS,
  PRE_BOOKING_KEYS,
  isQuietHour,
  readWhatsAppRules,
  sendsInQuietHours,
  type WhatsAppRules,
} from "./rules";
import {
  WHATSAPP_AUTOMATIONS,
  buildTemplateComponents,
  firstNameOf,
  isAutomationReady,
  readAutomationSettings,
  type WhatsAppAutomationKey,
  type WhatsAppAutomationSetting,
  type WhatsAppSlot,
} from "./automations";

const LOOKBACK_MS = 48 * 60 * 60 * 1000;
const BATCH = 1000;
const PAGE = 1000;
const DEFAULT_TIMEZONE = "Africa/Johannesburg";
const DAY_MS = 24 * 60 * 60 * 1000;
const REPLY_LOOKBACK_MS = 14 * DAY_MS;
const LEAD_CHASE_WINDOW_MS = 2 * DAY_MS;
const OPEN_LEAD_STATUSES = ["new", "contacted"];
const STAFF_ROLES = ["kitchen_manager", "kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_manager", "cleaning_staff"];
const ADMIN_ROLES = ["owner", "company_admin", "admin"];
const ACTIVE_ORDER_STATUSES = ["confirmed", "preparing", "ready", "in_transit"];

interface Candidate {
  entityType: string;
  entityId: string;
  /** Set when one record goes to several people, such as every admin. */
  dedupId?: string;
  phone: string | null;
  clientName: string | null;
  eventName: string | null;
  publicToken?: string | null;
  pausedUntil?: string | null;
}

export interface WhatsAppAutomationResult {
  companies: number;
  queued: number;
  skipped: number;
  errors: string[];
}

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function quoteCandidate(quote: any): Candidate {
  return {
    entityType: "quote",
    entityId: quote.id,
    phone: quote.client_phone || quote.clients?.mobile_number || quote.clients?.phone || null,
    clientName: quote.client_name,
    eventName: quote.quote_name,
    publicToken: quote.public_token,
    pausedUntil: quote.clients?.comms_paused_until,
  };
}

function orderCandidate(order: any): Candidate {
  return {
    entityType: "order",
    entityId: order.id,
    phone: order.client_phone || order.clients?.mobile_number || order.clients?.phone || null,
    clientName: order.client_name,
    eventName: order.event_name,
    pausedUntil: order.comms_paused_until || order.clients?.comms_paused_until,
  };
}

function leadCandidate(lead: any): Candidate {
  return {
    entityType: "lead",
    entityId: lead.id,
    phone: lead.client_phone || lead.phone,
    clientName: lead.client_name,
    eventName: lead.event_type,
    pausedUntil: lead.comms_paused_until,
  };
}

/** Staff details by id, leaving out anyone who turned WhatsApp off. */
async function staffById(sb: any, companyId: string, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map<string, any>();
  const { data, error } = await sb.from("profiles").select("id, full_name, phone_number, mobile_number, whatsapp_opt_in")
    .eq("company_id", companyId).in("id", unique);
  if (error) throw error;
  return new Map<string, any>((data || []).filter((row: any) => row.whatsapp_opt_in !== false).map((row: any) => [row.id, row]));
}

function staffCandidate(person: any, entityType: string, entityId: string, eventName: string | null): Candidate {
  return {
    entityType,
    entityId,
    phone: person.mobile_number || person.phone_number,
    clientName: person.full_name,
    eventName,
  };
}

function shiftDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`));
}

const LEAD_FIELDS = "id, client_name, client_phone, phone, event_type, event_date, guest_count, status, source, converted_at, comms_paused_until";
const QUOTE_FIELDS = "id, client_name, client_phone, quote_name, public_token, clients:client_id (phone, mobile_number, comms_paused_until)";
const ORDER_FIELDS = "id, client_name, client_phone, event_name, comms_paused_until, clients:client_id (phone, mobile_number, comms_paused_until)";

async function loadCandidates(
  sb: any,
  key: WhatsAppAutomationKey,
  companyId: string,
  since: string,
  today: { date: string; hour: number },
  now: Date,
  enabledAt: string,
  rules: WhatsAppRules,
): Promise<Candidate[]> {
  const quotesAfter = async (column: string) => {
    const { data, error } = await sb.from("quotes").select(QUOTE_FIELDS)
      .eq("company_id", companyId).gte(column, since).is("deleted_at", null).limit(BATCH);
    if (error) throw error;
    return (data || []).map(quoteCandidate);
  };
  const ordersAfter = async (column: string) => {
    const { data, error } = await sb.from("orders").select(ORDER_FIELDS)
      .eq("company_id", companyId).gte(column, since).is("deleted_at", null).limit(BATCH);
    if (error) throw error;
    return (data || []).map(orderCandidate);
  };
  const ordersOn = async (date: string) => {
    const { data, error } = await sb.from("orders").select(ORDER_FIELDS)
      .eq("company_id", companyId).eq("event_date", date).in("status", ACTIVE_ORDER_STATUSES)
      .is("deleted_at", null).limit(BATCH);
    if (error) throw error;
    return (data || []).map(orderCandidate);
  };

  const newLeads = async () => {
    const { data, error } = await sb.from("leads").select(LEAD_FIELDS)
      .eq("company_id", companyId).gte("created_at", since).is("deleted_at", null).limit(BATCH);
    if (error) throw error;
    return data || [];
  };

  switch (key) {
    case "whatsapp_lead_followup": return (await newLeads()).map(leadCandidate);
    case "whatsapp_lead_details":
      return (await newLeads()).filter((lead: any) => !lead.event_date || !lead.guest_count).map(leadCandidate);
    case "whatsapp_lead_chase": {
      const chaseAfter = rules.leadChaseDays * DAY_MS;
      const latest = new Date(now.getTime() - chaseAfter).toISOString();
      const earliest = new Date(now.getTime() - chaseAfter - LEAD_CHASE_WINDOW_MS).toISOString();
      const { data, error } = await sb.from("leads").select(LEAD_FIELDS)
        .eq("company_id", companyId).gte("created_at", enabledAt > earliest ? enabledAt : earliest).lte("created_at", latest)
        .in("status", OPEN_LEAD_STATUSES).is("converted_at", null).is("deleted_at", null).limit(BATCH);
      if (error) throw error;
      return (data || []).map(leadCandidate);
    }
    case "whatsapp_touch_base": {
      const { data, error } = await sb.from("clients").select("id, client_name, phone, mobile_number, comms_paused_until")
        .eq("company_id", companyId).gte("created_at", since).is("deleted_at", null).limit(BATCH);
      if (error) throw error;
      return (data || []).map((client: any) => ({
        entityType: "client",
        entityId: client.id,
        phone: client.mobile_number || client.phone,
        clientName: client.client_name,
        eventName: null,
        pausedUntil: client.comms_paused_until,
      }));
    }
    case "whatsapp_order_update": return ordersAfter("confirmed_at");
    case "whatsapp_event_arrived": return ordersAfter("arrived_at_venue_at");
    case "whatsapp_staff_welcome_login": {
      const { data, error } = await sb.from("profiles").select("id, full_name, phone_number, mobile_number, whatsapp_opt_in")
        .eq("company_id", companyId).gte("created_at", since).in("role", STAFF_ROLES).limit(BATCH);
      if (error) throw error;
      return (data || []).filter((row: any) => row.whatsapp_opt_in !== false)
        .map((row: any) => staffCandidate(row, "profile", row.id, null));
    }
    case "whatsapp_staff_shift_confirm": {
      const [drivers, kitchen] = await Promise.all([
        sb.from("driver_shifts").select("id, driver_id, shift_date").eq("company_id", companyId).gte("created_at", since).limit(BATCH),
        sb.from("kitchen_shifts").select("id, staff_id, shift_date").eq("company_id", companyId).gte("created_at", since).limit(BATCH),
      ]);
      if (drivers.error) throw drivers.error;
      if (kitchen.error) throw kitchen.error;
      const shifts = [
        ...(drivers.data || []).map((row: any) => ({ id: row.id, person: row.driver_id, date: row.shift_date, type: "driver_shift" })),
        ...(kitchen.data || []).map((row: any) => ({ id: row.id, person: row.staff_id, date: row.shift_date, type: "kitchen_shift" })),
      ];
      const people = await staffById(sb, companyId, shifts.map((shift) => shift.person));
      return shifts.filter((shift) => people.has(shift.person))
        .map((shift) => staffCandidate(people.get(shift.person), shift.type, shift.id, shiftDateLabel(shift.date)));
    }
    case "whatsapp_staff_job_assigned": {
      const { data, error } = await sb.from("driver_assignments").select("id, driver_id, order_id")
        .eq("company_id", companyId).gte("created_at", since).limit(BATCH);
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) return [];
      const [people, orders] = await Promise.all([
        staffById(sb, companyId, rows.map((row: any) => row.driver_id)),
        sb.from("orders").select("id, event_name, order_number").eq("company_id", companyId).in("id", rows.map((row: any) => row.order_id)),
      ]);
      if (orders.error) throw orders.error;
      const orderById = new Map<string, any>((orders.data || []).map((row: any) => [row.id, row]));
      return rows.filter((row: any) => people.has(row.driver_id)).map((row: any) => {
        const order = orderById.get(row.order_id);
        return staffCandidate(people.get(row.driver_id), "driver_assignment", row.id, order?.event_name || order?.order_number || null);
      });
    }
    case "whatsapp_staff_pickup_ready": {
      const { data, error } = await sb.from("orders").select("id, assigned_driver_id, event_name, order_number")
        .eq("company_id", companyId).gte("ready_at", since).is("deleted_at", null).limit(BATCH);
      if (error) throw error;
      const rows = data || [];
      const people = await staffById(sb, companyId, rows.map((row: any) => row.assigned_driver_id));
      return rows.filter((row: any) => people.has(row.assigned_driver_id))
        .map((row: any) => staffCandidate(people.get(row.assigned_driver_id), "order", row.id, row.event_name || row.order_number));
    }
    case "embed_lead_admin_whatsapp": {
      const leads = (await newLeads()).filter((lead: any) => lead.source === "embed");
      if (leads.length === 0) return [];
      const { data, error } = await sb.from("profiles").select("id, full_name, phone_number, mobile_number, whatsapp_opt_in")
        .eq("company_id", companyId).in("role", ADMIN_ROLES);
      if (error) throw error;
      const admins = (data || []).filter((row: any) => row.whatsapp_opt_in !== false);
      return leads.flatMap((lead: any) => admins.map((admin: any) => ({
        ...staffCandidate(admin, "lead", lead.id, lead.event_type || lead.client_name),
        dedupId: `${lead.id}:${admin.id}`,
      })));
    }
    case "whatsapp_quote_sent": return quotesAfter("sent_at");
    case "whatsapp_quote_accepted": return quotesAfter("accepted_at");
    case "whatsapp_order_on_the_way": return ordersAfter("picked_up_at");
    case "whatsapp_order_delivered": return ordersAfter("delivered_at");
    case "whatsapp_event_week": return ordersOn(addDays(today.date, 7));
    case "whatsapp_event_day_morning": return today.hour >= rules.eventDayHour ? ordersOn(today.date) : [];
    case "whatsapp_quote_chase": {
      const { data: log, error } = await sb.from("quote_followup_log").select("quote_id")
        .eq("company_id", companyId).eq("sequence_position", 1).eq("status", "sent")
        .gte("created_at", since).limit(BATCH);
      if (error) throw error;
      const ids = Array.from(new Set((log || []).map((row: any) => row.quote_id)));
      if (ids.length === 0) return [];
      const { data: quotes, error: quoteError } = await sb.from("quotes").select(QUOTE_FIELDS)
        .eq("company_id", companyId).in("id", ids).is("deleted_at", null)
        .not("status", "in", "(accepted,rejected,expired)");
      if (quoteError) throw quoteError;
      return (quotes || []).map(quoteCandidate);
    }
  }
}

function slotValue(slot: WhatsAppSlot, candidate: Candidate, company: { company_name: string; slug: string | null }): string {
  switch (slot) {
    case "first_name": return firstNameOf(candidate.clientName);
    case "event_name": return String(candidate.eventName || "").trim() || "your event";
    case "company_name": return company.company_name;
    case "quote_url": return buildPublicQuoteUrlServer(candidate.publicToken || "", company.slug) || "";
  }
}

/** Reads every matching row. A plain query stops at the API's 1,000-row cap. */
async function allRows(build: () => any): Promise<{ rows: any[]; error: unknown }> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows, error: null };
  }
}

/** Everything that can stop a message for one person, loaded once per company. */
async function loadSendGuards(sb: any, companyId: string, now: Date) {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const replyCutoff = new Date(now.getTime() - REPLY_LOOKBACK_MS).toISOString();
  const [blockedRows, clientRows, replyRows, sentRows] = await Promise.all([
    allRows(() => sb.from("blocked_contacts").select("phone").eq("company_id", companyId)),
    allRows(() => sb.from("clients").select("phone, mobile_number, whatsapp_opt_in").eq("company_id", companyId).not("whatsapp_opt_in", "is", null)),
    allRows(() => sb.from("whatsapp_inbound_messages").select("from_phone").eq("company_id", companyId).gte("received_at", replyCutoff)),
    allRows(() => sb.from("whatsapp_messages").select("recipient_phone, dedup_key").eq("company_id", companyId).gte("created_at", weekAgo)),
  ]);
  // Without the block list we can't tell who must not be messaged.
  if (blockedRows.error) throw new Error("Could not read the block list");

  const blocked = new Set<string>(blockedRows.rows.map((row: any) => normaliseToE164(row.phone)).filter(Boolean));
  const agreed = new Set<string>();
  for (const row of clientRows.rows) {
    for (const phone of [normaliseToE164(row.mobile_number), normaliseToE164(row.phone)].filter(Boolean)) {
      if (row.whatsapp_opt_in === false) blocked.add(phone);
      if (row.whatsapp_opt_in === true) agreed.add(phone);
    }
  }
  const sentThisWeek = new Map<string, number>();
  for (const row of sentRows.rows) {
    const key = String(row.dedup_key || "").split(":")[1] as WhatsAppAutomationKey;
    if (!String(row.dedup_key || "").startsWith("auto:") || !PRE_BOOKING_KEYS.has(key)) continue;
    const phone = normaliseToE164(row.recipient_phone);
    sentThisWeek.set(phone, (sentThisWeek.get(phone) || 0) + 1);
  }
  return {
    blocked,
    agreed,
    replied: new Set<string>(replyRows.rows.map((row: any) => normaliseToE164(row.from_phone))),
    sentThisWeek,
  };
}

async function queueCompany(
  sb: any,
  company: { id: string; company_name: string; slug: string | null; timezone: string | null },
  ready: Array<[WhatsAppAutomationKey, WhatsAppAutomationSetting]>,
  rules: WhatsAppRules,
  now: Date,
  result: WhatsAppAutomationResult,
): Promise<void> {
  const today = localParts(now, company.timezone || DEFAULT_TIMEZONE);
  const guards = await loadSendGuards(sb, company.id, now);

  for (const [key, setting] of ready) {
    if (isQuietHour(today.hour, rules) && !sendsInQuietHours(key)) continue;
    const automation = WHATSAPP_AUTOMATIONS.find((item) => item.key === key)!;
    const lookback = new Date(now.getTime() - LOOKBACK_MS).toISOString();
    const since = String(setting.enabledAt) > lookback ? String(setting.enabledAt) : lookback;
    const candidates = await loadCandidates(sb, key, company.id, since, today, now, String(setting.enabledAt), rules);

    for (const candidate of candidates) {
      const phone = normaliseToE164(candidate.phone);
      const paused = candidate.pausedUntil && new Date(candidate.pausedUntil) > now;
      const values = automation.slots.map((slot) => slotValue(slot, candidate, company));
      const overLimit = rules.weeklyLimit > 0 && PRE_BOOKING_KEYS.has(key)
        && (guards.sentThisWeek.get(phone) || 0) >= rules.weeklyLimit;
      const needsConsent = rules.requireConsent && CLIENT_KEYS.has(key) && !guards.agreed.has(phone);
      const alreadyReplied = FOLLOW_UP_KEYS.has(key) && guards.replied.has(phone);
      if (!phone || guards.blocked.has(phone) || paused || overLimit || needsConsent || alreadyReplied || values.some((value) => !value)) {
        result.skipped += 1;
        continue;
      }
      const { error } = await sb.from("whatsapp_messages").insert({
        company_id: company.id,
        recipient_phone: phone,
        recipient_name: candidate.clientName,
        message_type: "template",
        template_name: setting.templateName,
        template_language: setting.language,
        template_params: { components: buildTemplateComponents(values) },
        status: "pending",
        related_entity_type: candidate.entityType,
        related_entity_id: candidate.entityId,
        dedup_key: `auto:${key}:${candidate.dedupId || candidate.entityId}`,
      });
      if (!error) {
        result.queued += 1;
        if (PRE_BOOKING_KEYS.has(key)) guards.sentThisWeek.set(phone, (guards.sentThisWeek.get(phone) || 0) + 1);
      }
      else if (String(error.code) === "23505") result.skipped += 1; // Already sent for this quote or order.
      else result.errors.push(`${key}: ${error.message}`);
    }
  }
}

export async function runWhatsAppAutomations(sb: any, now = new Date()): Promise<WhatsAppAutomationResult> {
  const result: WhatsAppAutomationResult = { companies: 0, queued: 0, skipped: 0, errors: [] };
  const { data: integrations, error } = await sb.from("integrations").select("company_id, settings")
    .eq("integration_type", "whatsapp").eq("is_active", true);
  if (error) throw error;

  for (const integration of integrations || []) {
    const settings = readAutomationSettings(integration.settings);
    const ready = (Object.entries(settings) as Array<[WhatsAppAutomationKey, WhatsAppAutomationSetting]>)
      .filter(([, setting]) => isAutomationReady(setting));
    if (ready.length === 0) continue;

    const { data: company } = await sb.from("companies").select("id, company_name, slug, timezone")
      .eq("id", integration.company_id).maybeSingle();
    if (!company) continue;
    result.companies += 1;
    try {
      await queueCompany(sb, company, ready, readWhatsAppRules(integration.settings), now, result);
    } catch (e: any) {
      result.errors.push(`company ${integration.company_id}: ${e?.message || "failed"}`);
    }
  }
  return result;
}
