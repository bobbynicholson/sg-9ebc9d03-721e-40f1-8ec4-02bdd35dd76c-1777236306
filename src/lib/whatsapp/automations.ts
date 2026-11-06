/**
 * The WhatsApp messages a company can turn on, one by one, on the WhatsApp
 * page. Anything left off is never sent automatically.
 *
 * WhatsApp only lets a business start a conversation with a template that
 * Meta has approved, so each message stores the name of the company's
 * approved template. `wording` is the suggested text to submit to Meta; the
 * numbered {{1}} slots are filled from `slots`, in order.
 *
 * Shared by the WhatsApp page, its API route and the automation job.
 */
export const WHATSAPP_AUTOMATION_KEYS = [
  "whatsapp_lead_followup",
  "whatsapp_lead_details",
  "whatsapp_lead_chase",
  "whatsapp_touch_base",
  "whatsapp_quote_sent",
  "whatsapp_quote_chase",
  "whatsapp_quote_accepted",
  "whatsapp_order_update",
  "whatsapp_event_week",
  "whatsapp_event_day_morning",
  "whatsapp_order_on_the_way",
  "whatsapp_event_arrived",
  "whatsapp_order_delivered",
  "whatsapp_staff_welcome_login",
  "whatsapp_staff_shift_confirm",
  "whatsapp_staff_job_assigned",
  "whatsapp_staff_pickup_ready",
  "embed_lead_admin_whatsapp",
] as const;

export type WhatsAppAutomationKey = (typeof WHATSAPP_AUTOMATION_KEYS)[number];
export type WhatsAppSlot = "first_name" | "event_name" | "company_name" | "quote_url" | "lead_url";

export const WHATSAPP_GROUPS = ["Enquiries", "Quotes", "Booked events", "Staff"] as const;
export type WhatsAppGroup = (typeof WHATSAPP_GROUPS)[number];

export interface WhatsAppAutomation {
  key: WhatsAppAutomationKey;
  label: string;
  when: string;
  group: WhatsAppGroup;
  /** The basic set: quote sent, one follow-up and the event day. */
  recommended: boolean;
  wording: string;
  slots: WhatsAppSlot[];
}

export const WHATSAPP_AUTOMATIONS: WhatsAppAutomation[] = [
  {
    key: "whatsapp_lead_followup",
    label: "New enquiry reply",
    when: "When a new enquiry comes in",
    group: "Enquiries",
    recommended: false,
    wording: "Hi {{1}}, thank you for your enquiry to {{2}}. We'll be in touch shortly.",
    slots: ["first_name", "company_name"],
  },
  {
    key: "whatsapp_lead_details",
    label: "Ask for event details",
    when: "When a new enquiry has no event date or guest count",
    group: "Enquiries",
    recommended: false,
    wording: "Hi {{1}}, thanks for contacting {{2}}. Please send us your event date and guest numbers so we can prepare your quote.",
    slots: ["first_name", "company_name"],
  },
  {
    key: "whatsapp_lead_chase",
    label: "Enquiry follow-up",
    when: "3 days after an enquiry that is still open",
    group: "Enquiries",
    recommended: false,
    wording: "Hi {{1}}, just following up on your enquiry to {{2}}. Are you still looking for catering?",
    slots: ["first_name", "company_name"],
  },
  {
    key: "whatsapp_touch_base",
    label: "New contact",
    when: "When a new client contact is added",
    group: "Enquiries",
    recommended: false,
    wording: "Hi {{1}}, this is {{2}}. Please save this number, and message us here any time.",
    slots: ["first_name", "company_name"],
  },
  {
    key: "whatsapp_quote_sent",
    label: "Quote sent",
    when: "After a quote is sent to the client",
    group: "Quotes",
    recommended: true,
    wording: "Hi {{1}}, your quote for {{2}} from {{3}} is ready. You can view it here: {{4}} Please let us know if you have any questions.",
    slots: ["first_name", "event_name", "company_name", "quote_url"],
  },
  {
    key: "whatsapp_quote_chase",
    label: "Quote follow-up",
    when: "When the first quote follow-up email goes out",
    group: "Quotes",
    recommended: true,
    wording: "Hi {{1}}, just checking in on your quote for {{2}} from {{3}}. You can review it here: {{4}} We're happy to help with any changes.",
    slots: ["first_name", "event_name", "company_name", "quote_url"],
  },
  {
    key: "whatsapp_quote_accepted",
    label: "Quote accepted",
    when: "After the client accepts a quote",
    group: "Quotes",
    recommended: false,
    wording: "Hi {{1}}, thank you for accepting your quote for {{2}}. {{3}} will be in touch with the next steps.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_order_update",
    label: "Booking confirmed",
    when: "When an order is confirmed",
    group: "Booked events",
    recommended: false,
    wording: "Hi {{1}}, your booking for {{2}} with {{3}} is confirmed. Thank you!",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_event_week",
    label: "One week before the event",
    when: "7 days before a booked event",
    group: "Booked events",
    recommended: false,
    wording: "Hi {{1}}, your {{2}} is one week away. Please let {{3}} know if anything has changed.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_event_day_morning",
    label: "On the day: all on track",
    when: "From 8:00 on the morning of a booked event",
    group: "Booked events",
    recommended: true,
    wording: "Hi {{1}}, today is the day! Everything is on track for your {{2}}. The {{3}} team will see you soon.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_order_on_the_way",
    label: "Order on the way",
    when: "When the driver leaves with the order",
    group: "Booked events",
    recommended: false,
    wording: "Hi {{1}}, your order for {{2}} from {{3}} is on its way.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_event_arrived",
    label: "Arrived at the venue",
    when: "When the driver arrives at the venue",
    group: "Booked events",
    recommended: false,
    wording: "Hi {{1}}, the {{3}} team has arrived for your {{2}}. We're setting up now.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_order_delivered",
    label: "Order delivered",
    when: "When the order is marked delivered",
    group: "Booked events",
    recommended: false,
    wording: "Hi {{1}}, your order for {{2}} has been delivered. Thank you for choosing {{3}}, we hope it goes well.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_staff_welcome_login",
    label: "New staff welcome",
    when: "When a new staff member is added",
    group: "Staff",
    recommended: false,
    wording: "Hi {{1}}, welcome to the {{2}} team. Check your email to sign in to the staff app.",
    slots: ["first_name", "company_name"],
  },
  {
    key: "whatsapp_staff_shift_confirm",
    label: "New shift",
    when: "When a driver or kitchen shift is added",
    group: "Staff",
    recommended: false,
    wording: "Hi {{1}}, you have a new shift on {{2}} with {{3}}. Please check it in the staff app.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_staff_job_assigned",
    label: "Job assigned to driver",
    when: "When a driver is assigned to an order",
    group: "Staff",
    recommended: false,
    wording: "Hi {{1}}, you have a new job for {{2}} with {{3}}. Open the staff app for the details.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "whatsapp_staff_pickup_ready",
    label: "Order ready for driver",
    when: "When the kitchen marks an order ready",
    group: "Staff",
    recommended: false,
    wording: "Hi {{1}}, the order for {{2}} is ready for pickup at {{3}}. Please collect it when you can.",
    slots: ["first_name", "event_name", "company_name"],
  },
  {
    key: "embed_lead_admin_whatsapp",
    label: "New website enquiry alert",
    when: "When a website form enquiry comes in (sent to company admins)",
    group: "Staff",
    recommended: false,
    wording: "Hi {{1}}, a new website enquiry has come in for {{2}}. Open {{3}} to reply.",
    slots: ["first_name", "event_name", "lead_url"],
  },
];

/** Templates with nothing in the app to trigger them, so they stay manual. */
export const WHATSAPP_MANUAL_ONLY: Array<{ key: string; label: string; group: WhatsAppGroup; when: string; reason: string }> = [
  {
    key: "whatsapp_delay_alert",
    label: "Delivery delay",
    group: "Booked events",
    when: "Sent by you when a delivery is running late",
    reason: "The app doesn't record delays. Use Running late WhatsApp in Tracking.",
  },
  {
    key: "whatsapp_staff_schedule_change",
    label: "Shift changed",
    group: "Staff",
    when: "Sent by you when a shift changes",
    reason: "Shifts also update at clock-in, so a real change can't be told apart.",
  },
  {
    key: "whatsapp_staff_check_in",
    label: "Staff check-in",
    group: "Staff",
    when: "Sent by you to check in on a staff member",
    reason: "This is a personal message with no event behind it.",
  },
  {
    key: "whatsapp_staff_welcome_no_login",
    label: "Shared-device staff welcome",
    group: "Staff",
    when: "Sent by you to staff who use a shared tablet",
    reason: "These staff have no portal account, so nothing marks them as new.",
  },
];

/** Where each message's direct WhatsApp button lives, with the real details filled in. */
export const WHATSAPP_SEND_FROM: Record<string, {
  label: string;
  href: string;
  also?: Array<{ label: string; href: string }>;
}> = {
  whatsapp_lead_followup: { label: "Open Leads", href: "/admin/leads" },
  whatsapp_lead_details: { label: "Open Leads", href: "/admin/leads" },
  whatsapp_lead_chase: { label: "Open Leads", href: "/admin/leads" },
  whatsapp_touch_base: { label: "Open Contacts", href: "/admin/contacts" },
  whatsapp_quote_sent: { label: "Open Quotes", href: "/admin/quotes" },
  whatsapp_quote_chase: { label: "Open Quotes", href: "/admin/quotes" },
  whatsapp_quote_accepted: { label: "Open Quotes", href: "/admin/quotes" },
  whatsapp_order_update: { label: "Open Orders", href: "/admin/orders" },
  whatsapp_event_week: { label: "Open Tracking to choose an order", href: "/admin/tracking" },
  whatsapp_event_day_morning: { label: "Open Tracking to choose an order", href: "/admin/tracking" },
  whatsapp_order_on_the_way: { label: "Open Tracking to choose an order", href: "/admin/tracking" },
  whatsapp_event_arrived: { label: "Open Tracking to choose an order", href: "/admin/tracking" },
  whatsapp_order_delivered: { label: "Open Tracking to choose an order", href: "/admin/tracking" },
  embed_lead_admin_whatsapp: { label: "Open Leads", href: "/admin/leads" },
  whatsapp_staff_welcome_login: { label: "Open Users", href: "/admin/users" },
  whatsapp_delay_alert: { label: "Open Tracking to choose an order", href: "/admin/tracking" },
  whatsapp_staff_shift_confirm: {
    label: "Driver schedule", href: "/admin/driver-schedule",
    also: [{ label: "Kitchen schedule", href: "/admin/kitchen-schedule" }],
  },
  whatsapp_staff_job_assigned: { label: "Open Orders", href: "/admin/orders" },
  whatsapp_staff_pickup_ready: { label: "Open Orders", href: "/admin/orders" },
  whatsapp_staff_schedule_change: {
    label: "Driver schedule", href: "/admin/driver-schedule",
    also: [{ label: "Kitchen schedule", href: "/admin/kitchen-schedule" }],
  },
  whatsapp_staff_check_in: { label: "Open staff", href: "/admin/staff" },
  whatsapp_staff_welcome_no_login: { label: "Open staff", href: "/admin/staff" },
};

const SAMPLE_VALUES: Record<WhatsAppSlot, string> = {
  first_name: "Sam",
  event_name: "Year-end lunch",
  company_name: "Your company",
  quote_url: "https://cateringms.com/q/sample",
  lead_url: "https://cateringms.com/admin/leads?leadId=sample",
};

const SLOT_LABELS: Record<WhatsAppSlot, string> = {
  first_name: "First name",
  event_name: "Event name",
  company_name: "Your company name",
  quote_url: "Link to the quote",
  lead_url: "Link to the enquiry in Leads",
};

function sampleValues(automation: WhatsAppAutomation, companyName?: string | null): Record<WhatsAppSlot, string> {
  return {
    ...SAMPLE_VALUES,
    company_name: companyName || SAMPLE_VALUES.company_name,
    event_name: automation.key === "whatsapp_staff_shift_confirm" ? "12 December" : SAMPLE_VALUES.event_name,
  };
}

/** The message as a person would read it, filled with sample details. */
export function automationPreview(automation: WhatsAppAutomation, companyName?: string | null, wording?: string): string {
  const sample = sampleValues(automation, companyName);
  return automation.slots.reduce(
    (text, slot, index) => text.split(`{{${index + 1}}}`).join(sample[slot]),
    wording?.trim() || automation.wording,
  );
}

/**
 * The app always sends every number for a message, so edited wording has to
 * keep them all and can't add new ones, or Meta refuses the message.
 */
export function wordingProblem(automation: WhatsAppAutomation, wording: string): string | null {
  const text = wording.trim();
  if (!text) return null;
  if (text.length > 1024) return "Keep the wording under 1,024 characters.";
  const used = new Set(text.match(/\{\{\d+\}\}/g) || []);
  const expected = automation.slots.map((_slot, index) => `{{${index + 1}}}`);
  const missing = expected.filter((token) => !used.has(token));
  if (missing.length > 0) return `Keep ${missing.join(", ")} in the wording.`;
  const extra = Array.from(used).filter((token) => !expected.includes(token));
  if (extra.length > 0) return `Remove ${extra.join(", ")}. This message doesn't have that detail.`;
  if (/^\{\{\d+\}\}|\{\{\d+\}\}[.!?]?$/.test(text)) return "Start and end the wording with normal text, because Meta rejects a number in brackets there.";
  return null;
}

/** What each numbered slot in the wording means, for the WhatsApp page. */
export function automationVariables(automation: WhatsAppAutomation, companyName?: string | null) {
  const sample = sampleValues(automation, companyName);
  return automation.slots.map((slot, index) => ({
    token: `{{${index + 1}}}`,
    label: slot === "event_name" && automation.key === "whatsapp_staff_shift_confirm" ? "Shift date" : SLOT_LABELS[slot],
    example: sample[slot],
  }));
}

export interface WhatsAppAutomationSetting {
  enabled: boolean;
  /** When it was turned on. Nothing that happened earlier is ever sent. */
  enabledAt: string | null;
  templateName: string;
  language: string;
  /** The company's own wording. Empty means the suggested wording. */
  wording: string;
}

export type WhatsAppAutomationSettings = Record<WhatsAppAutomationKey, WhatsAppAutomationSetting>;

const DEFAULT_LANGUAGE = "en";

/** Meta template names are lowercase letters, numbers and underscores. */
export function isValidTemplateName(name: string): boolean {
  return /^[a-z0-9_]{1,512}$/.test(name);
}

export function isValidLanguageCode(code: string): boolean {
  return /^[a-z]{2,3}(_[A-Z]{2})?$/.test(code);
}

/** Every message defaults to off, so nothing sends until a company chooses it. */
export function readAutomationSettings(stored: unknown): WhatsAppAutomationSettings {
  const saved = (stored && typeof stored === "object" ? (stored as { automations?: unknown }).automations : null) as
    | Record<string, Partial<WhatsAppAutomationSetting>>
    | null
    | undefined;
  return Object.fromEntries(WHATSAPP_AUTOMATION_KEYS.map((key) => {
    const row = saved?.[key];
    return [key, {
      enabled: row?.enabled === true,
      enabledAt: typeof row?.enabledAt === "string" ? row.enabledAt : null,
      templateName: typeof row?.templateName === "string" ? row.templateName : "",
      language: typeof row?.language === "string" && row.language ? row.language : DEFAULT_LANGUAGE,
      wording: typeof row?.wording === "string" ? row.wording : "",
    }];
  })) as WhatsAppAutomationSettings;
}

/** Only a message that is on, and has an approved template, can send. */
export function isAutomationReady(setting: WhatsAppAutomationSetting): boolean {
  return setting.enabled && !!setting.enabledAt && isValidTemplateName(setting.templateName);
}

/**
 * Applies a save from the WhatsApp page. A message only gets a new start time
 * when it is switched on, so saving again never resends anything.
 */
export function applyAutomationChanges(
  current: WhatsAppAutomationSettings,
  incoming: Partial<Record<WhatsAppAutomationKey, { enabled?: boolean; templateName?: string; language?: string; wording?: string }>>,
  now: string,
): WhatsAppAutomationSettings {
  const next = { ...current };
  for (const key of WHATSAPP_AUTOMATION_KEYS) {
    const change = incoming[key];
    if (!change) continue;
    const enabled = change.enabled === true;
    next[key] = {
      enabled,
      enabledAt: enabled ? (current[key].enabled ? current[key].enabledAt : now) : null,
      templateName: String(change.templateName ?? current[key].templateName).trim(),
      language: String(change.language ?? current[key].language).trim() || DEFAULT_LANGUAGE,
      wording: String(change.wording ?? current[key].wording).trim(),
    };
  }
  return next;
}

export function firstNameOf(name: string | null | undefined): string {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

/** The body parameters Meta expects for a template, in {{1}}, {{2}} order. */
export function buildTemplateComponents(values: string[]) {
  return [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }];
}
