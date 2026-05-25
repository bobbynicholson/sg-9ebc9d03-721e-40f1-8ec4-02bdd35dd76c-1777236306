/**
 * Message template registry - the canonical catalogue of every
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
  { name: "tenant_name",   description: "Tenant / catering brand name",          example: "Spit Braai Delivery" },
  { name: "from_name",     description: "Sender's name (the operator)",          example: "Bobby" },
  { name: "event_name",    description: "Event description",                     example: "30th birthday braai" },
  { name: "event_date",    description: "Formatted event date",                  example: "5 May 2026" },
  { name: "guest_count",   description: "Number of guests",                      example: "80" },
];

const QUOTE_VARS: TemplateVariable[] = [
  ...COMMON_CLIENT_VARS,
  { name: "quote_ref",     description: "Quote reference number",                example: "Q-001" },
  { name: "total",         description: "Quote total (formatted as R12,345)",    example: "R12,345" },
  { name: "total_zar",     description: "Quote total in ZAR, no decimals",       example: "R 12 345" },
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

// Vars carried by the order-lifecycle status emails. Keys match
// the substitution bag built in services/order/orderWorkflow.ts so
// the editor stays in lock-step with what's actually sent. The
// _phrase variants render as " for 5 May 2026" / " to The Venue"
// when the data is present and empty when it isn't, so the body
// reads cleanly either way.
const ORDER_LIFECYCLE_VARS: TemplateVariable[] = [
  { name: "first_name",        description: "Client's first name",                example: "Bobby" },
  { name: "order_number",      description: "Order reference, e.g. ORD-003829",   example: "ORD-003829" },
  { name: "event_name",        description: "Event description",                  example: "30th birthday braai" },
  { name: "tenant_name",       description: "Catering brand name",                example: "Spit Braai Delivery" },
  { name: "event_date_phrase", description: "Reads as ' for 5 May 2026' or blank",example: " for 5 May 2026" },
  { name: "venue_phrase",      description: "Reads as ' to Sandton Suburb' or blank", example: " to Sandton Suburb" },
  { name: "eta_sentence",      description: "Driver ETA sentence (auto-built)",   example: "Estimated arrival in about 25 minutes." },
];

// Lead notifications that get pushed to the operator when a fresh
// embed form lands. The same payload feeds the admin email, the
// admin WhatsApp ping, and the in-app push.
const EMBED_LEAD_VARS: TemplateVariable[] = [
  { name: "client_name",   description: "Lead's name from the form",          example: "Sarah Bekker" },
  { name: "client_email",  description: "Lead's email",                       example: "sarah@example.com" },
  { name: "client_phone",  description: "Lead's phone",                       example: "+27 82 123 4567" },
  { name: "event_type",    description: "Event type chosen on the form",      example: "Wedding" },
  { name: "event_date",    description: "Event date",                         example: "5 May 2026" },
  { name: "guest_count",   description: "Guest count",                        example: "120" },
  { name: "venue",         description: "Venue / location",                   example: "Avianto, Muldersdrift" },
  { name: "budget",        description: "Budget range from the form",         example: "R 50 000 - R 80 000" },
  { name: "notes",         description: "Notes / message field",              example: "Vegetarian option please" },
  { name: "form_name",     description: "Which embed form fired",             example: "Wedding enquiry" },
  { name: "company_name",  description: "Your catering company name",         example: "Spit Braai Delivery" },
];

// Late-stage event reminders (one week + day before) sent from
// orderWorkflow.ts in the cron pre-event sweep.
const EVENT_REMINDER_VARS: TemplateVariable[] = [
  { name: "first_name",   description: "Client's first name",         example: "Bobby" },
  { name: "client_name",  description: "Full client name",            example: "Bobby Nicholson" },
  { name: "event_name",   description: "Event description",           example: "30th birthday braai" },
  { name: "event_date",   description: "Formatted event date",        example: "5 May 2026" },
  { name: "guest_count",  description: "Number of guests",            example: "80" },
  { name: "venue",        description: "Venue / location",            example: "Sandton" },
  { name: "tenant_name",  description: "Catering brand name",         example: "Spit Braai Delivery" },
  { name: "order_number", description: "Order reference",             example: "ORD-003829" },
];

// Vars for transactional money + collection reminders fired by the
// cron jobs (balance reminder, equipment collection reminder).
const REMINDER_VARS: TemplateVariable[] = [
  { name: "first_name",     description: "Client's first name",           example: "Bobby" },
  { name: "event_name",     description: "Event description",             example: "30th birthday braai" },
  { name: "event_date",     description: "Event date",                    example: "5 May 2026" },
  { name: "amount_due",     description: "Amount outstanding (formatted)",example: "R 6 500" },
  { name: "due_date",       description: "When payment / pickup is due",  example: "1 May 2026" },
  { name: "pay_link",       description: "Pay-now link for the client",   example: "https://app.example.com/pay/..." },
  { name: "tenant_name",    description: "Catering brand name",           example: "Spit Braai Delivery" },
  { name: "order_number",   description: "Order reference",               example: "ORD-003829" },
];

// Vars for portal / magic-link / welcome emails sent on signup or
// invite. Subset re-used across owner welcome + staff invite + client
// magic link so the editor surfaces the same names everywhere.
const PORTAL_LINK_VARS: TemplateVariable[] = [
  { name: "first_name",     description: "Recipient's first name",            example: "Bobby" },
  { name: "full_name",      description: "Recipient's full name",             example: "Bobby Nicholson" },
  { name: "company_name",   description: "Catering company name",             example: "Spit Braai Delivery" },
  { name: "portal_link",    description: "Magic / invite link the user clicks", example: "https://app.example.com/auth/..." },
  { name: "link_expiry",    description: "Human-readable expiry window",      example: "24 hours" },
  { name: "from_name",      description: "Sender's name",                     example: "Bobby" },
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
    defaultSubject: "{{first_name}}, quick check-in on your {{event_name}}",
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
    defaultSubject: "Following up on your {{event_name}} quote",
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
    defaultSubject: "{{first_name}}, anything coming up we can help with?",
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
    defaultSubject: "{{first_name}}, door is still open from {{tenant_name}}",
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
    defaultSubject: "{{event_name}} quote from {{tenant_name}} - {{total_zar}}",
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
    defaultSubject: "Revised {{event_name}} quote - {{total_zar}}",
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
    defaultSubject: "{{first_name}}, you're booked in for {{event_name}} with {{tenant_name}}",
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
    description: "Old quote that's lapsed. Offer a fresh one.",
    defaultSubject: "Your {{event_name}} quote has expired - want a fresh one?",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `The quote we sent for your {{event_name}} on {{event_date}} has lapsed. Pricing on a few items may have shifted since.\n\n` +
      `If the event is still on, I can put a fresh quote across in a few minutes. Just confirm guest numbers and venue and I will get it out today.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_quote_draft",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Quote in draft",
    description: "Heads-up that the quote is being prepared.",
    defaultSubject: "Quick note on your {{event_name}} quote",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Just a heads up that I am polishing your quote for {{event_name}} on {{event_date}}. I will have it across to you shortly. If anything has changed on your side (guest count, venue, dietary), let me know now so I can fold it in.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_quote_rejected",
    channel: "email",
    category: "client",
    group: "Win-back",
    label: "Quote rejected, soft win-back",
    description: "Client passed on the quote. Door-open response.",
    defaultSubject: "{{first_name}}, door is still open from {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Understand the quote did not land this time. No hard feelings. Happy to be kept in mind for the next event. If anything comes up where we can help, drop me a line and I will put a fresh quote together quickly.\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  // --- CLIENT EMAIL: relationship lifecycle ---
  {
    key: "email_client_active",
    channel: "email",
    category: "client",
    group: "Active client",
    label: "Final details for upcoming event",
    description: "Active client, event coming up. Confirm last details.",
    defaultSubject: "Final details for {{event_name}} on {{event_date}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Quick check-in. Everything's on track for your upcoming event. Would you like to confirm guest numbers and any last menu tweaks this week?\n\n` +
      `Reply here and I'll lock it in.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_client_returning",
    channel: "email",
    category: "client",
    group: "Active client",
    label: "Returning client check-in",
    description: "Booked with us before. Warm follow-up.",
    defaultSubject: "{{first_name}}, good to have you back at {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Always nice to see your name in the inbox. Let's lock in the next one when you have the details. Same flow as before, anything you want to tweak this time around just shout.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_client_vip",
    channel: "email",
    category: "client",
    group: "Active client",
    label: "VIP, no agenda check-in",
    description: "Top client, friendly note with no pitch.",
    defaultSubject: "{{first_name}}, it's been a while - how are things?",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `No agenda here. Just wanted to drop a note and say hi.\n\n` +
      `If there's anything coming up where we can help, you know where to find me.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_client_cold",
    channel: "email",
    category: "client",
    group: "Win-back",
    label: "Cold lead, gentle re-engage",
    description: "Long pause since the last booking.",
    defaultSubject: "{{first_name}}, hello from {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Reaching out after a long pause. We've added a few things to the menu since you last booked. Worth a look if you have anything coming up.\n\n` +
      `No pressure, just keeping the door open.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_client_won",
    channel: "email",
    category: "client",
    group: "Active client",
    label: "Confirmed booking, generic check-in",
    description: "Default catch-all for confirmed clients.",
    defaultSubject: "Quick check-in on {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Hope all is well. Let me know if there's anything we can help with on the catering side.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  // --- LEAD ACTIONS (button-driven follow-ups in /admin/leads) ---
  {
    key: "email_lead_reply",
    channel: "email",
    category: "client",
    group: "Lead follow-up",
    label: "Lead reply (fresh enquiry)",
    description: "First reply when a fresh lead lands.",
    defaultSubject: "{{first_name}}, thanks for the {{event_name}} enquiry - {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thanks for getting in touch about your {{event_name}} on {{event_date}}. I have everything I need on this side to put a draft quote together for you. Could you confirm guest numbers and venue when you have a sec?\n\n` +
      `Happy to walk through menu options if it would help.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_lead_touch_base",
    channel: "email",
    category: "client",
    group: "Lead follow-up",
    label: "Touch base on a warm lead",
    description: "A few days after the initial enquiry, no quote yet.",
    defaultSubject: "{{first_name}}, circling back on your {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Just circling back on your {{event_name}}. Did anything come up that I can help with on the catering side? Happy to share menu ideas before you commit to anything.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_lead_follow_up",
    channel: "email",
    category: "client",
    group: "Lead follow-up",
    label: "Follow up on a quiet lead",
    description: "Last nudge before the lead goes cold.",
    defaultSubject: "Following up on your {{event_name}} enquiry",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `It has been a few days since we last touched on your {{event_name}}. Wanted to make sure your enquiry has not slipped through. Reply here and I can have a quote across to you the same day.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_lead_chase_quote",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Chase a sent quote (lead-side)",
    description: "Lead has a quote but has gone quiet.",
    defaultSubject: "Following up on your {{event_name}} quote - {{total_zar}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Just circling back on the quote we sent for your {{event_name}}. Anything you would like changed, or shall we lock the date in?\n\nBest,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_lead_winback",
    channel: "email",
    category: "client",
    group: "Win-back",
    label: "Lead win-back",
    description: "Quote did not land. Soft door-open note.",
    defaultSubject: "{{first_name}}, door is still open from {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Understand the last quote did not land for your {{event_name}}. No hard feelings. Happy to be considered for the next one. If anything comes up, drop me a line and I will put a fresh quote across quickly.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_lead_reopen",
    channel: "email",
    category: "client",
    group: "Win-back",
    label: "Reopen a lost lead",
    description: "Lead was marked lost. No agenda nudge.",
    defaultSubject: "{{first_name}}, hello from {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `No agenda here, just keeping the door open. If anything comes up where we can help on the catering side, I am happy to put together a quick quote.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },

  // --- CLIENT WHATSAPP ---
  {
    key: "whatsapp_touch_base",
    channel: "whatsapp",
    category: "client",
    group: "Outreach",
    label: "Touch base",
    description: "Soft intro / no-pressure ping for a freshly imported contact you've never spoken to before.",
    defaultBody:
      `Hi {{first_name}}, hope you're well! Just touching base from {{company_name}}. Whenever you've got an event coming up, give me a shout and I'll put a quote together. No rush, just wanted to make sure you've got my number.\n\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "whatsapp_lead_followup",
    channel: "whatsapp",
    category: "client",
    group: "Lead follow-up",
    label: "Lead follow-up",
    description: "First WhatsApp on a fresh enquiry.",
    defaultBody:
      `Hi {{first_name}}, thanks for the enquiry about your event. Just checking that the date is still on. Happy to put a quote together as soon as I have final guest numbers.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, just sent the quote across for your event {{quote_ref}}. Sitting at {{total}} including VAT. Have a look when you can and let me know if anything needs tweaking.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, circling back on the quote {{quote_ref}}. Any thoughts? Happy to adjust the menu or the headcount if it helps.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, thanks for confirming! Deposit invoice is on its way through. Final guest numbers + dietary info 7 days before the event keeps everything tight.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, your event on {{event_date}} is coming up. Confirming guest numbers and any dietary requirements now so we can lock the kitchen prep in.\n\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "whatsapp_event_day_morning",
    channel: "whatsapp",
    category: "client",
    group: "Day of event",
    label: "Event day, morning",
    description: "We're prepping, driver leaves at X.",
    defaultBody:
      `Hi {{first_name}}, all set for today. Driver should be on site around the agreed time. Reply to this message if anything changes on your side.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, we are on site now. Anything you need, this thread is the fastest way to reach me.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, quick heads up, running a few minutes behind. Driver is on the way and I will message again as soon as we are pulling in.\n\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },

  // --- STAFF WHATSAPP ---
  {
    key: "whatsapp_staff_welcome_login",
    channel: "whatsapp",
    category: "staff",
    group: "Onboarding",
    label: "Welcome (portal login)",
    description: "Heads-up after a portal invite email goes out - helps it not get lost in spam.",
    defaultBody:
      `Hi {{first_name}}, welcome to {{company_name}}. We just emailed you a portal invite - check your inbox (and spam) and tap the link to set your password. Once you're in, you'll see your shifts, jobs, and earnings.\n\n{{from_name}}`,
    variables: STAFF_VARS,
  },
  {
    key: "whatsapp_staff_welcome_no_login",
    channel: "whatsapp",
    category: "staff",
    group: "Onboarding",
    label: "Welcome (no portal login)",
    description: "For staff who'll be tap-in'd on a shared tablet - explains the flow without an app to install.",
    defaultBody:
      `Hi {{first_name}}, welcome to {{company_name}}. You're on the books. No app to download - your manager will tap you in/out on the tablet at the start and end of each shift. Hours and pay roll up automatically. If anything ever feels off, ask me to check the system.\n\n{{from_name}}`,
    variables: STAFF_VARS,
  },
  {
    key: "whatsapp_staff_shift_confirm",
    channel: "whatsapp",
    category: "staff",
    group: "Shift",
    label: "Confirm shift",
    description: "Ask the staff member to YES the shift.",
    defaultBody:
      `Hi {{first_name}}, can you confirm you are good for {{shift_date}} ({{shift_time}})? Reply YES to lock it in.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, you have been assigned to {{client_name}} on {{event_date}}. Open your team portal for the full details (route / prep list / pickup time).\n\n{{from_name}}`,
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
      `Hi {{first_name}}, the order for {{client_name}} is ready for pickup at the kitchen.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, quick check-in. All good for today? Shout if anything is off.\n\n{{from_name}}`,
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
      `Hi {{first_name}}, heads up, there is a schedule change on your shift for {{shift_date}}. Open your team portal for the latest version.\n\n{{from_name}}`,
    variables: STAFF_VARS,
  },

  // --- ORDER LIFECYCLE (status emails) ---
  // These keys deliberately match the templateType passed to
  // resolveEmailTemplate() from services/order/orderWorkflow.ts so
  // the override row a tenant saves here is the same row the order
  // pipeline reads at send time. Edit one, change what the client
  // sees on the day.
  {
    key: "order_confirmed",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "Order confirmed",
    description: "Sent the moment a quote tips into a confirmed order.",
    defaultSubject: "Order confirmed - {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Your order {{order_number}}{{event_date_phrase}} is confirmed. ` +
      `We'll be in touch closer to the day with the final headcount and any last tweaks.\n\n` +
      `Thanks for booking with us.`,
    variables: ORDER_LIFECYCLE_VARS,
  },
  {
    key: "order_preparing",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "Kitchen prepping",
    description: "Short reassurance note when the kitchen starts prep.",
    defaultSubject: "We're prepping your {{event_name}} order",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `{{tenant_name}} has started prep{{event_date_phrase}}. ` +
      `We'll let you know when it's on the way.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: ORDER_LIFECYCLE_VARS,
  },
  {
    key: "order_ready",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "Order ready",
    description: "Sent when the kitchen marks prep complete.",
    defaultSubject: "Your {{event_name}} order is ready",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `{{tenant_name}} has finished prep. Driver will pick up shortly and we'll send tracking details once they're rolling.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: ORDER_LIFECYCLE_VARS,
  },
  {
    key: "order_in_transit",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "On the way",
    description: "Driver has left the kitchen.",
    defaultSubject: "On the way - {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Good news - your order {{order_number}} has just left the kitchen and is on its way{{venue_phrase}}. ` +
      `{{eta_sentence}}` +
      `\n\nReply to this email if anything changes on your side.`,
    variables: ORDER_LIFECYCLE_VARS,
  },
  {
    key: "order_delivered",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "Delivered",
    description: "Sent the moment the driver marks delivery complete.",
    defaultSubject: "Delivered - {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Your order {{order_number}} has been delivered. We hope it lands the way you hoped!\n\n` +
      `If anything wasn't quite right, please reply, we read every email and we'd rather hear it.`,
    variables: ORDER_LIFECYCLE_VARS,
  },

  // --- PRE-EVENT REMINDERS ---
  {
    key: "event_one_week_reminder",
    channel: "email",
    category: "client",
    group: "Pre-event",
    label: "One week to go",
    description: "Cron-fired check-in 7 days before the event.",
    defaultSubject: "One week to go - {{event_name}} on {{event_date}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Your event is one week away. Everything is on track for {{event_date}}.\n\n` +
      `Final details we'll need from you:\n` +
      `- Final guest count\n` +
      `- Any dietary requirements\n` +
      `- Confirmed delivery / setup time\n\n` +
      `Reply here with anything new on your side.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: EVENT_REMINDER_VARS,
  },
  {
    key: "event_day_before_reminder",
    channel: "email",
    category: "client",
    group: "Pre-event",
    label: "Tomorrow's the day",
    description: "Cron-fired check-in the day before the event.",
    defaultSubject: "Tomorrow's the day - {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Your event {{event_name}} is tomorrow. Driver is loaded and we're ready.\n\n` +
      `If anything has shifted (timing, headcount, venue access), reply now and we'll fold it in.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: EVENT_REMINDER_VARS,
  },

  // --- EMBED LEAD NOTIFICATIONS (operator-facing) ---
  {
    key: "embed_lead_admin_email",
    channel: "email",
    category: "staff",
    group: "Lead alerts",
    label: "New website lead (admin email)",
    description: "Internal email to the operator when an embed form on the tenant's website fires.",
    defaultSubject: "New enquiry from {{client_name}} - {{form_name}}",
    defaultBody:
      `New lead from your website form.\n\n` +
      `Name: {{client_name}}\n` +
      `Email: {{client_email}}\n` +
      `Phone: {{client_phone}}\n` +
      `Event: {{event_type}}\n` +
      `Date: {{event_date}}\n` +
      `Guests: {{guest_count}}\n` +
      `Venue: {{venue}}\n` +
      `Budget: {{budget}}\n\n` +
      `Notes: {{notes}}\n\n` +
      `Reply quickly while the enquiry is hot.`,
    variables: EMBED_LEAD_VARS,
  },
  {
    key: "embed_lead_admin_whatsapp",
    channel: "whatsapp",
    category: "staff",
    group: "Lead alerts",
    label: "New website lead (admin WhatsApp)",
    description: "WhatsApp ping to the operator when an embed form lead lands. Short on purpose.",
    defaultBody:
      `New lead from {{form_name}}.\n\n` +
      `{{client_name}} - {{event_type}} on {{event_date}}, {{guest_count}} guests.\n` +
      `Phone: {{client_phone}}\n` +
      `Email: {{client_email}}\n\n` +
      `Open the leads page to reply.`,
    variables: EMBED_LEAD_VARS,
  },
  {
    key: "embed_lead_thank_you_client",
    channel: "email",
    category: "client",
    group: "Lead follow-up",
    label: "Auto-reply to embed lead",
    description: "Auto-reply the lead receives after submitting the website enquiry form.",
    defaultSubject: "Thank you for your enquiry, {{client_name}}",
    defaultBody:
      `Hi {{client_name}},\n\n` +
      `Thanks for your enquiry about {{event_type}} on {{event_date}}. We've received it and one of our team will be in touch shortly with a tailored quote.\n\n` +
      `If anything has changed on your side, just reply to this email.\n\n` +
      `Thanks,\n{{company_name}}`,
    variables: EMBED_LEAD_VARS,
  },

  // --- TRANSACTIONAL REMINDERS (cron-driven) ---
  {
    key: "balance_reminder_email",
    channel: "email",
    category: "client",
    group: "Money",
    label: "Balance reminder",
    description: "Sent by the cron when an outstanding balance is approaching its due date.",
    defaultSubject: "Balance reminder for {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Quick reminder that the balance for {{event_name}} on {{event_date}} is due by {{due_date}}. ` +
      `Outstanding amount: {{amount_due}}.\n\n` +
      `Pay link: {{pay_link}}\n\n` +
      `Reply here if you'd like a different payment method or a corrected invoice.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: REMINDER_VARS,
  },
  {
    key: "equipment_collection_reminder",
    channel: "email",
    category: "client",
    group: "Post-event",
    label: "Equipment collection reminder",
    description: "Sent when hired equipment is still on site after the event and needs to be collected.",
    defaultSubject: "Quick heads-up: equipment collection for {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Hope {{event_name}} went brilliantly. Our team will be by to collect the hired equipment on {{due_date}}.\n\n` +
      `If that timing doesn't work, reply with what suits you and we'll reschedule.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: REMINDER_VARS,
  },

  // --- ACCOUNT / PORTAL ---
  {
    key: "client_magic_link",
    channel: "email",
    category: "client",
    group: "Account",
    label: "Client portal magic link",
    description: "Sent when a client requests access to their order portal.",
    defaultSubject: "Your {{company_name}} account link",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Here's the link to your {{company_name}} portal. It opens your orders, invoices and any messages we've sent.\n\n` +
      `{{portal_link}}\n\n` +
      `The link is valid for {{link_expiry}}. Request a new one any time from the website.\n\n` +
      `Thanks,\n{{company_name}}`,
    variables: PORTAL_LINK_VARS,
  },
  {
    key: "owner_welcome",
    channel: "email",
    category: "staff",
    group: "Account",
    label: "Owner welcome email",
    description: "First email a new tenant owner receives after signing up.",
    defaultSubject: "Welcome to {{company_name}}, {{first_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Welcome aboard. Your account is set up and ready.\n\n` +
      `Open the dashboard here: {{portal_link}}\n\n` +
      `A few good first steps:\n` +
      `1. Add your company logo and brand colours in /admin/white-label\n` +
      `2. Add your menu items in /admin/menu\n` +
      `3. Send your first lead-capture form to your website (look under Integrations)\n\n` +
      `Reply if you want a guided walkthrough.\n\n` +
      `Thanks,\n{{from_name}}`,
    variables: PORTAL_LINK_VARS,
  },
  {
    key: "staff_invite_login",
    channel: "email",
    category: "staff",
    group: "Account",
    label: "Staff portal invite",
    description: "Sent when a manager invites a staff member who needs portal access.",
    defaultSubject: "{{company_name}} invited you to the team portal",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `{{company_name}} has set up a portal account for you. From there you'll see your shifts, jobs and earnings.\n\n` +
      `Set your password here: {{portal_link}}\n\n` +
      `The link is valid for {{link_expiry}}.\n\n` +
      `Welcome to the team.\n\n` +
      `{{from_name}}`,
    variables: PORTAL_LINK_VARS,
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
