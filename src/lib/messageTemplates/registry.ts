/**
 * Message template registry -- the canonical catalogue of every
 * template the system knows about. One file, one source of truth.
 *
 * Each entry pairs:
 *   - a stable key  (e.g. "quote_chase") that the renderer + the DB
 *     override row use to look each other up
 *   - the channel   (email vs whatsapp)
 *   - the category  (client-facing vs staff-facing)
 *   - default subject (email only) + default body
 *   - the variables this template knows about ({{name}}-style),
 *     surfaced in the editor as insert chips so the operator does
 *     not have to remember the variable names
 *
 * The registry's defaults are what ships with the product. The DB
 * tables `email_templates` and `whatsapp_templates` carry per-company
 * overrides that the resolver layers on top at render time.
 *
 * Adding a new template: append an entry here with a unique key. The
 * editor picks it up automatically. The renderer call sites then
 * reference the key.
 */

export type MessageChannel = "email" | "whatsapp";
export type MessageCategory = "client" | "staff";

export interface TemplateVariable {
  /** Raw {{name}} token used in the body. */
  name: string;
  /** Human description shown next to the chip in the editor. */
  description: string;
  /** Sample value shown in the live preview. */
  example: string;
}

export interface TemplateDefinition {
  key: string;
  channel: MessageChannel;
  category: MessageCategory;
  /** UI label, sentence-case. */
  label: string;
  /** One-line "what this does" for the editor row. */
  description: string;
  /** Optional grouping in the editor (e.g. "Lead follow-up", "Quote", "Day of event"). */
  group: string;
  /** Email subject default (ignored on WhatsApp). */
  defaultSubject?: string;
  /** Body default. {{variable}} substitutions performed at render time. */
  defaultBody: string;
  /** Variables available for this template. */
  variables: TemplateVariable[];
}

// ── Shared variable helpers ─────────────────────────────────────────

const COMMON_CLIENT_VARS: TemplateVariable[] = [
  { name: "first_name",    description: "Client's first name",                   example: "Bobby" },
  { name: "client_name",   description: "Full client name",                      example: "Bobby Nicholson" },
  { name: "company_name",  description: "Your catering company name",            example: "Spit Braai Delivery" },
  { name: "from_name",     description: "Sender's name (the operator)",          example: "Bobby" },
  { name: "event_name",    description: "Event description",                     example: "30th birthday braai" },
  { name: "event_date",    description: "Formatted event date",                  example: "5 May 2026" },
  { name: "guest_count",   description: "Number of guests",                      example: "80" },
];

const QUOTE_VARS: TemplateVariable[] = [
  ...COMMON_CLIENT_VARS,
  { name: "quote_ref",     description: "Quote reference number",                example: "Q-001" },
  { name: "total",         description: "Quote total (formatted as R12,345)",    example: "R12,345" },
];

const STAFF_VARS: TemplateVariable[] = [
  { name: "first_name",    description: "Staff member's first name",             example: "Jane" },
  { name: "staff_name",    description: "Full staff name",                       example: "Jane Doe" },
  { name: "from_name",     description: "Sender's name (the operator)",          example: "Bobby" },
  { name: "company_name",  description: "Your catering company name",            example: "Spit Braai Delivery" },
  { name: "shift_date",    description: "Shift date",                            example: "5 May 2026" },
  { name: "shift_time",    description: "Shift time",                            example: "10:00 - 18:00" },
  { name: "client_name",   description: "Client they will serve",                example: "Bobby Nicholson" },
];

// ── REGISTRY ────────────────────────────────────────────────────────

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  // --- CLIENT EMAIL: lead lifecycle ---
  {
    key: "email_lead_hot",
    channel: "email",
    category: "client",
    group: "Lead follow-up",
    label: "Hot lead, fresh enquiry",
    description: "Reply to a brand-new enquiry quickly so they don't shop around.",
    defaultSubject: "Quick check-in on your catering enquiry",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thanks for reaching out about your event. Wanted to make sure your enquiry didn't slip through the cracks. Happy to put a quick quote together if you can share final guest numbers and your venue.\n\n` +
      `Let me know if you'd like to book a 10-minute call.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_lead_quoted",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Following up on a quote",
    description: "Quote sent, waiting for a reply. Soft chase.",
    defaultSubject: "Following up on your quote",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Just circling back on the quote we sent across. Anything you'd like changed, or shall we lock the date in for you?\n\n` +
      `Happy to walk through the menu options if helpful.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_lead_quiet",
    channel: "email",
    category: "client",
    group: "Win-back",
    label: "Quiet client, soft check-in",
    description: "Hasn't booked in a while. Door-open note, no pressure.",
    defaultSubject: "Anything coming up we can help with?",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `It's been a while since your last event with us. Hope all is well.\n\n` +
      `If you have something on the horizon (birthday, work do, family thing), happy to put together ideas before you brief anyone else.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_lead_lost",
    channel: "email",
    category: "client",
    group: "Win-back",
    label: "Lost lead, door-open",
    description: "Quote didn't land. Stay-in-touch note for the next event.",
    defaultSubject: "Following up",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Understand the quote did not land this time. No hard feelings. Happy to be kept in mind for the next event. If anything comes up where we can help, drop me a line and I will put a fresh quote together quickly.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  // --- CLIENT EMAIL: quote lifecycle ---
  {
    key: "email_quote_sent",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Quote just sent",
    description: "First send of a fresh quote.",
    defaultSubject: "Your catering quote {{quote_ref}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Quote for your {{event_name}} on {{event_date}} is across. The total sits at {{total}} including VAT.\n\n` +
      `Have a look and let me know if anything needs changing. Happy to walk through the menu options on a quick call.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_quote_revised",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Revised quote",
    description: "After a quote is updated.",
    defaultSubject: "Revised quote for your event",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `I have revised the quote based on what we last spoke about. Total is now {{total}}.\n\n` +
      `Have a quick look when you can and shout if anything still needs tweaking.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_quote_accepted",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Quote accepted, next steps",
    description: "Right after the client accepts.",
    defaultSubject: "Thanks for confirming, next steps",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thanks for confirming the quote{{quote_ref}}. Now that we are locked in for {{event_date}}, here is what happens next:\n\n` +
      `1. Deposit invoice on its way\n` +
      `2. Final guest numbers and dietary requirements 7 days before\n` +
      `3. Final walk-through call a week out\n\n` +
      `Reply here if anything has shifted on your side.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_quote_expired",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Quote expired",
    description: "Old quote that's lapsed -- offer a fresh one.",
    defaultSubject: "Your quote has expired, want me to refresh it?",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `The quote we sent for your {{event_name}} on {{event_date}} has lapsed. Pricing on a few items may have shifted since.\n\n` +
      `If the event is still on, I can put a fresh quote across in a few minutes. Just confirm guest numbers and venue and I will get it out today.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },

  // --- CLIENT WHATSAPP ---
  {
    key: "whatsapp_lead_followup",
    channel: "whatsapp",
    category: "client",
    group: "Lead follow-up",
    label: "Lead follow-up",
    description: "First WhatsApp on a fresh enquiry.",
    defaultBody:
      `Hi {{first_name}}, thanks for the enquiry about your event. Quick check -- still on for the date? Happy to put a quote together as soon as I have final guest numbers.\n\n-- {{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "whatsapp_quote_sent",
    channel: "whatsapp",
    category: "client",
    group: "Quote",
    label: "Quote sent (WhatsApp nudge)",
    description: "WhatsApp ping after the email goes across.",
    defaultBody:
      `Hi {{first_name}}, just sent the quote across for your event{{quote_ref}}. Sitting at {{total}} including VAT. Have a look when you can and let me know if anything needs tweaking.\n\n-- {{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "whatsapp_quote_chase",
    channel: "whatsapp",
    category: "client",
    group: "Quote",
    label: "Quote chase (WhatsApp)",
    description: "Soft chase if there is no email reply.",
    defaultBody:
      `Hi {{first_name}}, circling back on the quote{{quote_ref}}. Any thoughts? Happy to adjust the menu or the headcount if it helps.\n\n-- {{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "whatsapp_quote_accepted",
    channel: "whatsapp",
    category: "client",
    group: "Quote",
    label: "Quote accepted, WhatsApp confirm",
    description: "Right after acceptance, deposit follow-up.",
    defaultBody:
      `Hi {{first_name}}, thanks for confirming! Deposit invoice is on its way through. Final guest numbers + dietary info 7 days before the event keeps everything tight.\n\n-- {{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "whatsapp_event_week",
    channel: "whatsapp",
    category: "client",
    group: "Day of event",
    label: "Event this week",
    description: "Final-numbers nudge in the week before the event.",
    defaultBody:
      `Hi {{first_name}}, your event on {{event_date}} is coming up. Confirming guest numbers and any dietary requirements now so we can lock the kitchen prep in.\n\n-- {{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "whatsapp_event_day_morning",
    channel: "whatsapp",
    category: "client",
    group: "Day of event",
    label: "Event day -- morning",
    description: "We're prepping, driver leaves at X.",
    defaultBody:
      `Hi {{first_name}}, all set for today. Driver should be on site around the agreed time. Reply to this message if anything changes on your side.\n\n-- {{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "whatsapp_event_arrived",
    channel: "whatsapp",
    category: "client",
    group: "Day of event",
    label: "We are on site",
    description: "Driver has arrived at venue.",
    defaultBody:
      `Hi {{first_name}}, we are on site now. Anything you need, this thread is the fastest way to reach me.\n\n-- {{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "whatsapp_delay_alert",
    channel: "whatsapp",
    category: "client",
    group: "Day of event",
    label: "Running late",
    description: "Heads-up message when there's a delay.",
    defaultBody:
      `Hi {{first_name}}, quick heads-up -- running a few minutes behind. Driver is on the way and I will message again as soon as we are pulling in.\n\n-- {{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },

  // --- STAFF WHATSAPP ---
  {
    key: "whatsapp_staff_shift_confirm",
    channel: "whatsapp",
    category: "staff",
    group: "Shift",
    label: "Confirm shift",
    description: "Ask the staff member to YES the shift.",
    defaultBody:
      `Hi {{first_name}}, can you confirm you are good for {{shift_date}} ({{shift_time}})? Reply YES to lock it in.\n\n-- {{from_name}}`,
    variables: STAFF_VARS,
  },
  {
    key: "whatsapp_staff_job_assigned",
    channel: "whatsapp",
    category: "staff",
    group: "Job",
    label: "Job assigned",
    description: "Notify a driver / kitchen staff that they've been booked.",
    defaultBody:
      `Hi {{first_name}}, you have been assigned to {{client_name}} on {{event_date}}. Open your team portal for the full details (route / prep list / pickup time).\n\n-- {{from_name}}`,
    variables: STAFF_VARS,
  },
  {
    key: "whatsapp_staff_pickup_ready",
    channel: "whatsapp",
    category: "staff",
    group: "Job",
    label: "Pickup ready",
    description: "Tell the driver the order is ready.",
    defaultBody:
      `Hi {{first_name}}, the order for {{client_name}} is ready for pickup at the kitchen.\n\n-- {{from_name}}`,
    variables: STAFF_VARS,
  },
  {
    key: "whatsapp_staff_check_in",
    channel: "whatsapp",
    category: "staff",
    group: "General",
    label: "Quick check-in",
    description: "Generic 'how's it going' nudge.",
    defaultBody:
      `Hi {{first_name}}, quick check-in. All good for today? Shout if anything is off.\n\n-- {{from_name}}`,
    variables: STAFF_VARS,
  },
  {
    key: "whatsapp_staff_schedule_change",
    channel: "whatsapp",
    category: "staff",
    group: "Shift",
    label: "Schedule change",
    description: "Alert about a shift schedule update.",
    defaultBody:
      `Hi {{first_name}}, heads-up -- there is a schedule change on your shift for {{shift_date}}. Open your team portal for the latest version.\n\n-- {{from_name}}`,
    variables: STAFF_VARS,
  },
];

/** Get a template definition by key. */
export function getTemplateDefinition(key: string): TemplateDefinition | null {
  return TEMPLATE_REGISTRY.find((t) => t.key === key) || null;
}

/** Group templates for the editor UI. */
export function groupTemplates(): Array<{
  channel: MessageChannel;
  category: MessageCategory;
  group: string;
  templates: TemplateDefinition[];
}> {
  const buckets = new Map<string, TemplateDefinition[]>();
  for (const t of TEMPLATE_REGISTRY) {
    const k = `${t.channel}|${t.category}|${t.group}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }
  return Array.from(buckets.entries()).map(([k, templates]) => {
    const [channel, category, group] = k.split("|") as [MessageChannel, MessageCategory, string];
    return { channel, category, group, templates };
  });
}

/**
 * Substitute {{variable}} tokens in a string with the provided context.
 * Unknown tokens are left untouched (so the operator notices and fixes
 * the typo) rather than silently rendering as "undefined".
 */
export function renderTemplate(body: string, ctx: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_match, name: string) => {
    const value = ctx[name];
    if (value === undefined || value === null || value === "") {
      return _match;
    }
    return String(value);
  });
}
