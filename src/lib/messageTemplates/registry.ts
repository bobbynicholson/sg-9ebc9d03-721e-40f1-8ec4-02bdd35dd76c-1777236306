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

/**
 * How a template actually leaves the system.
 *
 *  - "automated":   the platform fires this without the operator
 *                   clicking anything (cron, webhook, status change).
 *                   Examples: order_confirmed, balance_reminder_email,
 *                   aftersales_*, embed_lead_admin_*, billing emails.
 *  - "manual":      the operator clicks a button on a workflow page
 *                   (Leads / Quotes / Staff) and the system either
 *                   composes the email through their own provider or
 *                   opens a draft in Gmail / Outlook to send by hand.
 *                   Examples: every email_lead_* / email_quote_* /
 *                   whatsapp_* outreach template.
 *  - "hybrid":      automated by default but the operator can also
 *                   trigger it manually for re-sends or back-fills.
 *
 * The editor surfaces this so an operator knows whether saving a
 * customisation here changes what the system will send next time it
 * fires, or what they'll see prefilled when they next click "Send"
 * on the Leads / Quotes page.
 */
export type MessageDelivery = "automated" | "manual" | "hybrid";

/**
 * Who owns the wording of a template.
 *
 *  - "tenant":   the catering business owns this. They send it from
 *                their own brand to their own clients / staff. Shows
 *                up in the tenant admin editor at
 *                /admin/email-templates.
 *  - "platform": Skylight / CateringMS sends this from the platform
 *                brand to the tenant (subscription receipts, trial
 *                reminders, owner welcome, account-deletion notices).
 *                Hidden from the tenant editor - the platform admin
 *                owns the wording.
 */
export type MessageScope = "tenant" | "platform";

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
  /**
   * How this template leaves the system. Defaults to "manual" when
   * omitted because the historical default for outreach templates
   * (every email_lead_* / whatsapp_*) is operator-clicked.
   */
  delivery?: MessageDelivery;
  /**
   * Plain-English description of WHEN the template fires (for
   * automated) or HOW it's used (for manual). Shown directly under
   * the row so an operator never has to guess.
   * Examples:
   *   "Fires when an order moves to delivered status"
   *   "Click the Send button on a quote row in /admin/quotes"
   */
  trigger?: string;
  /**
   * Where the operator goes to configure the firing rule for an
   * automated template (e.g. enable / disable, delay, cadence). Used
   * to render a "Manage automation" link on the editor row.
   */
  settingsLink?: string;
  /**
   * Defaults to "tenant" so every existing entry stays in the tenant
   * editor untouched. Mark "platform" for emails the platform itself
   * (Skylight / CateringMS) sends to the tenant - those belong to a
   * future platform admin portal, not the tenant's own editor.
   */
  scope?: MessageScope;
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
  { name: "quote_number",  description: "Quote number",                         example: "QUO-000051" },
  { name: "total",         description: "Quote total (formatted as R12,345)",    example: "R12,345" },
  { name: "total_zar",     description: "Quote total in ZAR, no decimals",       example: "R 12 345" },
  { name: "quote_url",     description: "Link for the client to view + accept the quote", example: "https://cateringms.com/.../q/abc123" },
  { name: "guest_count",   description: "Number of guests",                      example: "30" },
];

const STAFF_VARS: TemplateVariable[] = [
  { name: "first_name",    description: "Staff member's first name",             example: "Jane" },
  { name: "staff_name",    description: "Full staff name",                       example: "Jane Doe" },
  { name: "from_name",     description: "Sender's name (the operator)",          example: "Bobby" },
  { name: "company_name",  description: "Your catering company name",            example: "Spit Braai Delivery" },
  { name: "order_number",  description: "Order reference",                       example: "ORD-003829" },
  { name: "event_name",    description: "Event description",                     example: "30th birthday braai" },
  { name: "venue",         description: "Venue / location",                      example: "Sandton" },
  { name: "shift_date",    description: "Shift date",                            example: "5 May 2026" },
  { name: "shift_time",    description: "Shift time",                            example: "10:00 - 18:00" },
  { name: "client_name",   description: "Client they will serve",                example: "Bobby Nicholson" },
  { name: "order_url",     description: "Direct link to the order brief",         example: "https://cateringms.com/.../order/..." },
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
  { name: "order_url",         description: "Customer tracking / order status link", example: "https://cateringms.com/spit-braai-delivery/c/order/..." },
  { name: "payment_link",      description: "Payment or invoice link when money is due", example: "https://cateringms.com/pay/i/..." },
  { name: "invoice_link",      description: "Invoice link alias for tenant templates", example: "https://cateringms.com/pay/i/..." },
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

// After-sales sequence shared variable list. Used by the buildAfterSalesEntries
// helper below. Keys (clientName, eventType) match the bag built by
// lib/afterSalesTemplates.getEmailVariables so a template override here
// renders against the same data.
const AFTER_SALES_VARS: TemplateVariable[] = [
  { name: "clientName",  description: "Client's name",                  example: "Bobby Nicholson" },
  { name: "eventType",   description: "Type of event hosted",           example: "30th birthday" },
  { name: "eventDate",   description: "Original event date",            example: "5 May 2026" },
  { name: "eventMonth",  description: "Month name of the event",        example: "May" },
  { name: "orderId",     description: "Order id",                       example: "ORD-003829" },
  { name: "year",        description: "Year of the event",              example: "2026" },
];

// Subscription / billing / account variables. Used by every
// BillingEmailService-driven template. The bag is wide because each
// subtype carries a different cut; substitution leaves unknown tokens
// in place so the editor doesn't need a per-template variable set.
const SUBSCRIPTION_VARS: TemplateVariable[] = [
  { name: "user_name",            description: "Owner / admin name",                  example: "Bobby" },
  { name: "company_name",         description: "Catering company name",               example: "Spit Braai Delivery" },
  { name: "plan_name",            description: "Subscription plan name",              example: "Pro" },
  { name: "amount",               description: "Charge amount (formatted)",           example: "R 899" },
  { name: "billing_cycle",        description: "Monthly or Yearly",                   example: "Monthly" },
  { name: "next_billing_date",    description: "Next billing date",                   example: "1 June 2026" },
  { name: "renewal_date",         description: "Renewal date",                        example: "1 June 2026" },
  { name: "days_until_renewal",   description: "Days until renewal",                  example: "7" },
  { name: "subscription_url",     description: "Link to manage subscription",         example: "https://app.example.com/admin/subscription" },
  { name: "payment_date",         description: "Date payment was processed",          example: "1 May 2026" },
  { name: "transaction_id",       description: "Payment provider transaction id",     example: "TXN_ABC123" },
  { name: "billing_period_start", description: "Start of billing period",             example: "1 May 2026" },
  { name: "billing_period_end",   description: "End of billing period",               example: "31 May 2026" },
  { name: "invoice_url",          description: "Subscription invoice link",           example: "https://app.example.com/admin/subscription" },
  { name: "attempted_date",       description: "Date of failed payment attempt",      example: "1 May 2026" },
  { name: "failure_reason",       description: "Card-issuer reason for the failure", example: "Insufficient funds" },
  { name: "update_payment_url",   description: "Link to update payment method",       example: "https://app.example.com/admin/subscription" },
  { name: "trial_end_date",       description: "When the free trial ends",            example: "15 May 2026" },
  { name: "days_remaining",       description: "Days of trial left",                  example: "3" },
  { name: "clients_created",      description: "Clients created during trial",        example: "12" },
  { name: "quotes_created",       description: "Quotes created during trial",         example: "7" },
  { name: "orders_created",       description: "Orders created during trial",         example: "3" },
  { name: "pricing_url",          description: "Pricing page link",                   example: "https://app.example.com/pricing" },
  { name: "current_price",        description: "Current subscription price",          example: "R 799" },
  { name: "new_price",            description: "New subscription price",              example: "R 899" },
  { name: "effective_date",       description: "Date the price change applies",       example: "1 July 2026" },
  { name: "change_reason",        description: "Short explanation",                   example: "Annual price review" },
  { name: "explanation",          description: "Longer explanation paragraph",        example: "We're investing in infrastructure to keep the platform fast and reliable." },
  { name: "payment_method",       description: "Card on file label",                  example: "Visa ending 4242" },
  { name: "cancelled_date",       description: "Date the subscription was cancelled", example: "1 May 2026" },
  { name: "access_until_date",    description: "Last day of paid access",             example: "31 May 2026" },
  { name: "reactivate_url",       description: "Link to reactivate",                  example: "https://app.example.com/admin/subscription" },
  { name: "dashboard_url",        description: "Dashboard link",                      example: "https://app.example.com/admin/dashboard" },
  { name: "inviter_name",         description: "Name of the manager sending the invite", example: "Bobby" },
  { name: "role",                 description: "Role being assigned",                 example: "Team Member" },
  { name: "join_url",             description: "Invite acceptance link",              example: "https://app.example.com/auth/invite?token=..." },
  { name: "deletion_date",        description: "Scheduled account deletion date",     example: "1 June 2026" },
  { name: "cancel_deletion_url",  description: "Link to cancel the deletion request", example: "https://app.example.com/admin/account/restore" },
];

// Builds the after-sales sequence templates. Function declaration so
// it's hoisted and can be referenced from the TEMPLATE_REGISTRY
// initializer below.
function buildAfterSalesEntries(): TemplateDefinition[] {
  // Mirrors lib/afterSalesTemplates.defaultAfterSalesTemplates. Keys
  // map 1:1 to template_type values used by ensureScheduledAfterSales
  // in services/order/orderWorkflow.ts.
  return [
    {
      key: "aftersales_after-sales-1",
      channel: "email",
      category: "client",
      group: "After-sales",
      label: "Post-event check-in — 2 months",
      description: "Soft check-in 2 months after the event. Asks for honest feedback.",
      defaultSubject: "How did your {{eventType}} land?",
      defaultBody:
        `Hi {{clientName}},\n\n` +
        `It's been a couple of months since your {{eventType}} on {{eventDate}}. Hope it was everything you wanted it to be.\n\n` +
        `If you've got a minute, we'd love a quick line back - what worked, what we could've done differently. Honest is best.\n\n` +
        `Thanks again for trusting us with the day.`,
      variables: AFTER_SALES_VARS,
    },
    {
      key: "aftersales_after-sales-2",
      channel: "email",
      category: "client",
      group: "After-sales",
      label: "Post-event check-in — 4 months",
      description: "Menu-update check-in. No discount, no pressure.",
      defaultSubject: "If anything's coming up, we're here",
      defaultBody:
        `Hi {{clientName}},\n\n` +
        `Just a quick check-in. We've added a few new menu items since your {{eventType}} in {{eventMonth}}, plus some seasonal options that are good for this time of year.\n\n` +
        `If you've got something coming up - a corporate function, a family thing, a celebration - we're around. Reply to this email and we'll get a quote together.\n\n` +
        `No pressure, just hello.`,
      variables: AFTER_SALES_VARS,
    },
    {
      key: "aftersales_after-sales-3",
      channel: "email",
      category: "client",
      group: "After-sales",
      label: "Post-event check-in — 6 months",
      description: "Diary-fills-up nudge with no discount.",
      defaultSubject: "Half a year on - anything brewing?",
      defaultBody:
        `Hi {{clientName}},\n\n` +
        `Hard to believe it's been six months since your {{eventType}}.\n\n` +
        `Year-end and the festive season tend to fill up fast on our diary, so if you're thinking about a function in the next few months it's worth pencilling something in soon.\n\n` +
        `Reply to this email if you'd like a quick chat about what you've got in mind.`,
      variables: AFTER_SALES_VARS,
    },
    {
      key: "aftersales_after-sales-4",
      channel: "email",
      category: "client",
      group: "After-sales",
      label: "Post-event check-in — 8 months",
      description: "Friendly catch-up with what's new.",
      defaultSubject: "Hi from the team",
      defaultBody:
        `Hi {{clientName}},\n\n` +
        `Just dropping in to say hi.\n\n` +
        `Planning an event takes time and the right reason to do it - so we're not here to push. But if you've got something in mind, even loosely, we'd love to help shape it.\n\n` +
        `A few things we've added since your last booking:\n` +
        `- More dietary-flexible menu options\n` +
        `- Streamlined ordering for returning clients\n` +
        `- Better tracking and updates on the day\n\n` +
        `Reply if you're curious. Otherwise we'll catch up again later in the year.`,
      variables: AFTER_SALES_VARS,
    },
    {
      key: "aftersales_after-sales-5",
      channel: "email",
      category: "client",
      group: "After-sales",
      label: "Post-event check-in — 10 months",
      description: "End-of-year planning nudge.",
      defaultSubject: "Year's nearly out - planning anything?",
      defaultBody:
        `Hi {{clientName}},\n\n` +
        `End of the year tends to creep up. If you're thinking about a function before the holidays, or kicking off the new year with something planned, this is the moment to lock in dates.\n\n` +
        `We've still got a handful of slots open that we tend to hold for returning clients.\n\n` +
        `Reply to this email and we'll send through availability.`,
      variables: AFTER_SALES_VARS,
    },
    {
      key: "aftersales_after-sales-6",
      channel: "email",
      category: "client",
      group: "After-sales",
      label: "Post-event anniversary — 12 months",
      description: "One-year anniversary touch.",
      defaultSubject: "A year since your {{eventType}}",
      defaultBody:
        `Hi {{clientName}},\n\n` +
        `A year ago you trusted us with your {{eventType}}. That still means a lot.\n\n` +
        `If you've got another event on the horizon - anniversary, birthday, function - we'd love to do it again. Same care, just for whatever you're planning next.\n\n` +
        `Reply when you're ready, no rush.\n\n` +
        `Thanks for being a client.`,
      variables: AFTER_SALES_VARS,
    },
  ];
}

// ── REGISTRY ────────────────────────────────────────────────────────

export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  // --- CLIENT EMAIL: lead lifecycle ---
  {
    key: "email_lead_hot",
    channel: "email",
    category: "client",
    group: "Lead follow-up",
    label: "New enquiry — quick reply",
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
    label: "Sent quote — follow-up",
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
    label: "Inactive lead — gentle check-in",
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
    label: "Lost lead — keep the door open",
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
    label: "New quote email",
    description: "First send of a fresh quote.",
    defaultSubject: "Your {{event_name}} quote from {{tenant_name}} - {{total_zar}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thank you for the opportunity to quote on {{event_name}}. Your quote {{quote_number}} is ready, and the total comes to {{total}} including VAT.\n\n` +
      `You can view the full breakdown and accept your quote here:\n{{quote_url}}\n\n` +
      `Please have a look when you get a chance and let me know if anything needs changing. I am happy to adjust the menu or talk through the options on a quick call.\n\nKind regards,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_quote_revised",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Revised quote email",
    description: "After a quote is updated.",
    defaultSubject: "Your revised {{event_name}} quote - {{total_zar}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thank you for your patience. I have updated your quote {{quote_number}} for {{event_name}} based on what we last discussed, and the new total comes to {{total}} including VAT.\n\n` +
      `You can view the updated quote here:\n{{quote_url}}\n\n` +
      `Please take a look when you can and let me know if anything still needs tweaking. Happy to make further changes.\n\nKind regards,\n{{from_name}}`,
    variables: QUOTE_VARS,
  },
  {
    key: "email_quote_accepted",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Accepted quote — manual next steps",
    description: "Right after the client accepts.",
    defaultSubject: "{{first_name}}, you're booked in for {{event_name}} with {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thanks for confirming your quote. Now that we are locked in for {{event_date}}, here is what happens next:\n\n` +
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
    label: "Expired quote — offer a refresh",
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
    label: "Draft quote — preparation update",
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
    label: "Declined quote — keep the door open",
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
    label: "Upcoming event — confirm final details",
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
    label: "Returning client — check-in",
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
    label: "VIP client — relationship check-in",
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
    label: "Inactive client — re-engagement",
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
    label: "Confirmed client — general check-in",
    description: "General-purpose check-in for a client with a confirmed booking.",
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
    label: "New enquiry — detailed reply",
    description: "First reply when a fresh lead lands.",
    defaultSubject: "{{first_name}}, thanks for the {{event_name}} enquiry - {{tenant_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thanks for getting in touch about your {{event_name}} on {{event_date}}. I have the event details on file and can put a draft quote together from what you've shared.\n\n` +
      `If guest numbers, venue, or timing changes, just reply with the update and I will adjust the draft before sending it through.\n\n` +
      `Happy to walk through menu options if it would help.\n\nBest,\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },
  {
    key: "email_lead_touch_base",
    channel: "email",
    category: "client",
    group: "Lead follow-up",
    label: "Warm enquiry — check-in",
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
    label: "Quiet enquiry — final follow-up",
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
    label: "Sent quote — follow-up from Leads",
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
    label: "Lost enquiry — win-back",
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
    label: "Lost enquiry — reopen",
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
    label: "New contact — first WhatsApp",
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
    label: "New enquiry — WhatsApp reply",
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
    label: "Quote sent — WhatsApp notification",
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
    label: "Sent quote — WhatsApp follow-up",
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
    label: "Accepted quote — WhatsApp confirmation",
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
    label: "Event week — client check-in",
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
    label: "Event morning — preparation update",
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
    label: "Arrival at venue — client update",
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
    label: "Delivery delay — client alert",
    description: "Heads-up message when there's a delay.",
    defaultBody:
      `Hi {{first_name}}, quick heads-up: we are running a few minutes behind. The driver is on the way and I will message again as soon as we are pulling in.\n\n{{from_name}}`,
    variables: COMMON_CLIENT_VARS,
  },

  // --- STAFF WHATSAPP ---
  {
    key: "whatsapp_staff_welcome_login",
    channel: "whatsapp",
    category: "staff",
    group: "Onboarding",
    label: "New staff member — portal welcome",
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
    label: "New staff member — shared-device welcome",
    description: "Explains how staff use the shared on-site device when they do not have portal access.",
    defaultBody:
      `Hi {{first_name}}, welcome to {{company_name}}. You're on the books. No app to download - your manager will tap you in/out on the tablet at the start and end of each shift. Hours and pay roll up automatically. If anything ever feels off, ask me to check the system.\n\n{{from_name}}`,
    variables: STAFF_VARS,
  },
  {
    key: "whatsapp_staff_shift_confirm",
    channel: "whatsapp",
    category: "staff",
    group: "Shift",
    label: "Shift assignment — request confirmation",
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
    label: "Job assignment — staff notification",
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
    label: "Order ready — driver notification",
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
    label: "Staff member — general check-in",
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
    label: "Shift changed — staff notification",
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
    label: "Order confirmed — client email",
    description: "Sent the moment a quote tips into a confirmed order.",
    defaultSubject: "Order confirmed - {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Your order {{order_number}}{{event_date_phrase}} is confirmed. ` +
      `You can track the booking and payment status here:\n{{order_url}}\n\n` +
      `Payment link:\n{{payment_link}}\n\n` +
      `We'll be in touch closer to the day with the final headcount and any last tweaks.\n\n` +
      `Thanks for booking with us.`,
    variables: ORDER_LIFECYCLE_VARS,
  },
  {
    key: "order_preparing",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "Kitchen preparation started — client email",
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
    label: "Order ready — client email",
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
    label: "Delivery on the way — client email",
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
    label: "Order delivered — client email",
    description: "Sent the moment the driver marks delivery complete.",
    defaultSubject: "Delivered - {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Your order {{order_number}} has been delivered. We hope everything landed just the way you wanted.\n\n` +
      `If anything wasn't quite right, please reply. We read every email and we would rather hear about it.`,
    variables: ORDER_LIFECYCLE_VARS,
  },
  {
    key: "order_changed",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "Confirmed order changed — client email",
    description: "Sent when an amendment to a confirmed order is applied (guest count, menu, time, venue, etc.).",
    defaultSubject: "Update on your order {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `We've updated your order {{order_number}}{{event_date_phrase}}.\n\n` +
      `What changed: {{change_summary}}\n\n` +
      `Open your order to see the latest details: {{order_link}}\n\n` +
      `Reply to this email if anything looks off.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: [
      ...ORDER_LIFECYCLE_VARS,
      { name: "change_summary",     description: "Comma-separated list of what changed",   example: "guest count, menu items" },
      { name: "order_link",         description: "Client portal link to the order",        example: "https://app.example.com/c/order/..." },
      { name: "partial",            description: "1 when only some changes applied, blank otherwise", example: "" },
    ],
  },
  {
    key: "order_change_rejected",
    channel: "email",
    category: "client",
    group: "Order lifecycle",
    label: "Order change declined — client email",
    description: "Sent when the client requested a change and the operator couldn't apply it.",
    defaultSubject: "Couldn't apply your change to {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `We couldn't apply the change you requested on order {{order_number}}.\n\n` +
      `{{review_notes_paragraph}}` +
      `Reply to this email and we'll work it out together.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: [
      ...ORDER_LIFECYCLE_VARS,
      { name: "review_notes_paragraph", description: "Reason from the team (auto-built, blank when none)", example: "Reason from the team: kitchen prep is locked 48 hours out.\n\n" },
      { name: "review_notes",           description: "Raw reason text",                                   example: "Kitchen prep is locked 48 hours out." },
    ],
  },

  // --- PRE-EVENT REMINDERS ---
  {
    key: "event_one_week_reminder",
    channel: "email",
    category: "client",
    group: "Pre-event",
    label: "Event reminder — 1 week before",
    description: "Automatically sent 7 days before the event.",
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
    label: "Event reminder — 1 day before",
    description: "Automatically sent on the day before the event.",
    defaultSubject: "Tomorrow's the day - {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Your event {{event_name}} is tomorrow. Driver is loaded and we're ready.\n\n` +
      `If anything has shifted (timing, headcount, venue access), reply now and we'll fold it in.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: EVENT_REMINDER_VARS,
  },
  {
    key: "waiter_assignment_email",
    channel: "email",
    category: "staff",
    group: "Staff operations",
    label: "Waiter assigned — staff email",
    description: "Direct email to a waiter when an admin assigns them to an event.",
    defaultSubject: "Service job assigned - {{order_number}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `You have been assigned to service {{event_name}} for {{company_name}}.\n\n` +
      `Order: {{order_number}}\n` +
      `Date: {{shift_date}}\n` +
      `Time: {{shift_time}}\n` +
      `Venue: {{venue}}\n\n` +
      `Open the order brief before you go on site: {{order_url}}\n\n` +
      `Thanks,\n{{company_name}}`,
    variables: STAFF_VARS,
  },

  // --- EMBED LEAD NOTIFICATIONS (operator-facing) ---
  {
    key: "embed_lead_admin_email",
    channel: "email",
    category: "staff",
    group: "Lead alerts",
    label: "New website enquiry — admin email",
    description: "Internal email to the admin when someone submits a website enquiry form.",
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
    label: "New website enquiry — admin WhatsApp",
    description: "Short WhatsApp alert to the admin when someone submits a website enquiry form.",
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
    label: "Website enquiry — client confirmation",
    description: "Confirmation automatically sent to a client after they submit the website enquiry form.",
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
    label: "Outstanding balance — payment reminder",
    description: "Automatically sent when an outstanding balance is approaching its due date.",
    defaultSubject: "Balance reminder for {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Quick reminder that the balance for {{event_name}} on {{event_date}} is due by {{due_date}}. ` +
      `Outstanding amount: {{amount_due}}.\n\n` +
      `Pay link: {{pay_link}}\n\n` +
      `Reply here if you would prefer a different payment method or have any questions about the invoice.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: REMINDER_VARS,
  },
  {
    key: "equipment_collection_reminder",
    channel: "email",
    category: "client",
    group: "Post-event",
    label: "Equipment collection — client reminder",
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
    label: "Client portal — sign-in link",
    description: "Secure sign-in link sent when a client requests access to their order portal.",
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
    label: "Staff portal — invitation email",
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

  // --- CANCELLATION / REFUND / POSTPONEMENT ---
  // Keys deliberately match templateType used by
  // services/email/cancellationEmails.ts so tenant overrides land
  // immediately when an operator saves a customisation here.
  {
    key: "cancellation_approved",
    channel: "email",
    category: "client",
    group: "Cancellation",
    label: "Order cancellation — client confirmation",
    description: "Confirmation email when an order is cancelled. The refund_paragraph variable carries the per-policy refund / credit / no-refund wording.",
    defaultSubject: "Order cancelled - {{order_number}}",
    defaultBody:
      `Hi {{client_first_name}},\n\n` +
      `This confirms that order {{order_number}}{{event_date_label}} has been cancelled.\n\n` +
      `{{refund_paragraph}}` +
      `If this wasn't expected, please reply to this email and we'll sort it out straight away.\n\n` +
      `Thanks,\n{{company_name}}`,
    variables: [
      { name: "client_first_name",  description: "Client's first name",              example: "Bobby" },
      { name: "order_number",       description: "Order reference",                  example: "ORD-003829" },
      { name: "event_date_label",   description: "Optional date phrase",             example: " for 5 May 2026" },
      { name: "refund_paragraph",   description: "Refund / credit / no-refund block (auto-built per policy)", example: "Per our cancellation policy, a refund of R 2 500 is due..." },
      { name: "refund_amount",      description: "Refund amount (formatted)",        example: "R 2 500" },
      { name: "credit_amount",      description: "Store credit amount (formatted)",  example: "R 485" },
      { name: "refund_sla_phrase",  description: "Tenant-configured refund SLA",     example: "within 3 business days" },
      { name: "company_name",       description: "Catering company name",            example: "Spit Braai Delivery" },
      { name: "tenant_name",        description: "Catering brand name",              example: "Spit Braai Delivery" },
      { name: "event_name",         description: "Event description",                example: "30th birthday braai" },
    ],
  },
  {
    key: "refund_paid",
    channel: "email",
    category: "client",
    group: "Cancellation",
    label: "Refund payment — client confirmation",
    description: "Sent after a refund EFT has been processed.",
    defaultSubject: "Refund processed for {{order_number}} - {{refund_amount}}",
    defaultBody:
      `Hi {{client_first_name}},\n\n` +
      `Confirming that the refund of {{refund_amount}} for the cancelled order {{order_number}} has been processed. ` +
      `It should land in your account within the next 1-3 business days, depending on your bank.\n\n` +
      `Reply to this email if anything looks off.\n\n` +
      `Thanks,\n{{company_name}}`,
    variables: [
      { name: "client_first_name", description: "Client's first name",        example: "Bobby" },
      { name: "order_number",      description: "Order reference",            example: "ORD-003829" },
      { name: "refund_amount",     description: "Refund amount (formatted)",  example: "R 2 500" },
      { name: "company_name",      description: "Catering company name",      example: "Spit Braai Delivery" },
      { name: "tenant_name",       description: "Catering brand name",        example: "Spit Braai Delivery" },
    ],
  },
  {
    key: "postponement_approved",
    channel: "email",
    category: "client",
    group: "Cancellation",
    label: "Event postponement — client confirmation",
    description: "Sent when a client postpones their event to a new date.",
    defaultSubject: "Postponed to {{new_event_date}} - {{order_number}}",
    defaultBody:
      `Hi {{client_first_name}},\n\n` +
      `Your booking has been postponed. New event date: {{new_event_date}}.\n\n` +
      `Everything else on the order stays the same. If you need to tweak anything, just reply to this email.\n\n` +
      `Thanks,\n{{company_name}}`,
    variables: [
      { name: "client_first_name", description: "Client's first name",            example: "Bobby" },
      { name: "order_number",      description: "Order reference",                example: "ORD-003829" },
      { name: "new_event_date",    description: "Rescheduled event date",         example: "12 May 2026" },
      { name: "company_name",      description: "Catering company name",          example: "Spit Braai Delivery" },
      { name: "tenant_name",       description: "Catering brand name",            example: "Spit Braai Delivery" },
      { name: "event_name",        description: "Event description",              example: "30th birthday braai" },
    ],
  },

  // --- INVOICE + PAYMENT ---
  // Keys match templateType used by services/invoiceGenerationService.ts
  // (deposit_invoice_issued / balance_invoice_issued) and
  // pages/api/webhooks/payment-confirmation.ts (balance_payment_received).
  {
    key: "deposit_invoice_issued",
    channel: "email",
    category: "client",
    group: "Invoice",
    label: "Deposit invoice — client email",
    description: "Sent when the deposit invoice is first issued to lock in the event date.",
    defaultSubject: "Deposit invoice {{invoice_number}} - {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thanks for accepting your {{event_name}} quote - you're booked in.\n\n` +
      `Your deposit invoice {{invoice_number}} is ready. Deposit due: {{amount}}.\n\n` +
      `Pay or download it here: {{invoice_link}}\n\n` +
      `View your order: {{order_url}}\n\n` +
      `Once the payment clears, your event date is locked in.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: [
      { name: "first_name",     description: "Client's first name",          example: "Bobby" },
      { name: "client_name",    description: "Full client name",             example: "Bobby Nicholson" },
      { name: "tenant_name",    description: "Catering brand name",          example: "Spit Braai Delivery" },
      { name: "event_name",     description: "Event description",            example: "30th birthday braai" },
      { name: "invoice_number", description: "Invoice number",               example: "INV-2026-0421" },
      { name: "amount",         description: "Amount on this invoice",       example: "R 4 500" },
      { name: "deposit_amount", description: "Deposit amount",               example: "R 4 500" },
      { name: "invoice_link",   description: "Direct link to the invoice",   example: "https://app.example.com/c/invoice/..." },
      { name: "order_url",      description: "Secure link to the accepted order", example: "https://cateringms.com/spit-braai-delivery/c/order/..." },
    ],
  },
  {
    key: "balance_invoice_issued",
    channel: "email",
    category: "client",
    group: "Invoice",
    label: "Balance invoice — client email",
    description: "Sent when the balance invoice goes out after the deposit is paid.",
    defaultSubject: "Balance invoice {{invoice_number}} - {{event_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `{{tenant_name}} issued the balance invoice {{invoice_number}} for {{event_name}}. Balance due: {{amount}}.\n\n` +
      `Open the invoice: {{invoice_link}}\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: [
      { name: "first_name",     description: "Client's first name",          example: "Bobby" },
      { name: "client_name",    description: "Full client name",             example: "Bobby Nicholson" },
      { name: "tenant_name",    description: "Catering brand name",          example: "Spit Braai Delivery" },
      { name: "event_name",     description: "Event description",            example: "30th birthday braai" },
      { name: "invoice_number", description: "Invoice number",               example: "INV-2026-0421B" },
      { name: "amount",         description: "Amount on this invoice",       example: "R 6 500" },
      { name: "balance_amount", description: "Balance amount",               example: "R 6 500" },
      { name: "invoice_link",   description: "Direct link to the invoice",   example: "https://app.example.com/c/invoice/..." },
    ],
  },
  {
    key: "deposit_payment_received",
    channel: "email",
    category: "client",
    group: "Invoice",
    label: "Deposit received — client receipt",
    description: "Receipt sent when the deposit payment lands and the booking becomes secure.",
    defaultSubject: "Deposit received - {{event_name}} booking secure",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `We've received your deposit for {{event_name}}. Amount: {{amount_formatted}}. Reference: {{invoice_number}}.\n\n` +
      `Your booking is secure and your event date is locked in.\n\n` +
      `Thanks,\n{{tenant_name}}`,
    variables: [
      { name: "first_name",       description: "Client's first name",          example: "Bobby" },
      { name: "client_name",      description: "Full client name",             example: "Bobby Nicholson" },
      { name: "tenant_name",      description: "Catering brand name",          example: "Spit Braai Delivery" },
      { name: "company_name",     description: "Catering brand name alias",    example: "Spit Braai Delivery" },
      { name: "event_name",       description: "Event description",            example: "30th birthday braai" },
      { name: "invoice_number",   description: "Invoice number",               example: "INV-2026-0421" },
      { name: "order_number",     description: "Order reference",              example: "ORD-003829" },
      { name: "amount",           description: "Amount received, numeric",     example: "4 500.00" },
      { name: "amount_formatted", description: "Amount received, formatted",   example: "R4 500.00" },
      { name: "invoice_link",     description: "Direct link to the invoice",   example: "https://app.example.com/pay/i/..." },
    ],
  },
  {
    key: "balance_payment_received",
    channel: "email",
    category: "client",
    group: "Invoice",
    label: "Payment received — client receipt",
    description: "Receipt sent when a client payment lands (deposit, balance, or full payment).",
    defaultSubject: "Payment received - invoice {{invoice_number}}",
    defaultBody:
      `Hi {{client_name}},\n\n` +
      `Thanks for your payment of {{amount}} against invoice {{invoice_number}}.\n\n` +
      `Reply to this email if anything looks off.\n\n` +
      `Thanks,\n{{company_name}}`,
    variables: [
      { name: "client_name",    description: "Client's first name or 'there'", example: "Bobby" },
      { name: "invoice_number", description: "Invoice number",                example: "INV-2026-0421" },
      { name: "order_number",   description: "Order reference (often the same as invoice)", example: "INV-2026-0421" },
      { name: "amount",         description: "Amount received (formatted)",   example: "R 6 500.00" },
      { name: "company_name",   description: "Catering company name",         example: "Spit Braai Delivery" },
    ],
  },

  // --- QUOTE ACCEPTED ---
  // quote_accepted_client is already wired in pages/api/public/quotes/[token]/accept.ts
  {
    key: "quote_accepted_client",
    channel: "email",
    category: "client",
    group: "Quote",
    label: "Quote accepted — client confirmation",
    description: "Auto-reply the client receives the moment they accept a quote on the portal.",
    defaultSubject: "Quote accepted - thanks {{first_name}}",
    defaultBody:
      `Hi {{first_name}},\n\n` +
      `Thanks for accepting your {{event_name}} quote - you're booked in.\n\n` +
      `Here's what happens from here:\n\n` +
      `1. Confirmation email: this email is your record. A copy of the quote is on your client portal.\n` +
      `2. Deposit invoice: {{tenant_name}} will send the deposit invoice shortly to lock in your event date.\n` +
      `3. Event day{{event_day_suffix}}: we'll be in touch the week before with final headcount and any last tweaks.\n\n` +
      `If anything has changed on your side, just reply to this email and we'll sort it.\n\n` +
      `Looking forward to it,\n{{tenant_name}}`,
    variables: [
      { name: "first_name",       description: "Client's first name",              example: "Bobby" },
      { name: "client_name",      description: "Full client name",                 example: "Bobby Nicholson" },
      { name: "tenant_name",      description: "Catering brand name",              example: "Spit Braai Delivery" },
      { name: "event_name",       description: "Event description",                example: "30th birthday braai" },
      { name: "event_date",       description: "Formatted event date",             example: "5 May 2026" },
      { name: "event_day_suffix", description: "Optional ' (5 May 2026)' suffix",  example: " (5 May 2026)" },
    ],
  },
  {
    key: "quote_accepted_admin_notify",
    channel: "email",
    category: "staff",
    group: "Quote",
    label: "Quote accepted — admin alert",
    description: "Operator-facing email when a client accepts a quote on the portal.",
    defaultSubject: "Quote accepted - {{client_name}}",
    defaultBody:
      `{{acceptor_name}} just accepted the quote for {{client_name}}.\n\n` +
      `Total: {{total}}\n` +
      `Event date: {{event_date}}\n` +
      `Guests: {{guest_count}}\n\n` +
      `Open the quote to convert it into an order:\n{{quote_link}}`,
    variables: [
      { name: "client_name",   description: "Client name on the quote",       example: "Bobby Nicholson" },
      { name: "acceptor_name", description: "Name typed at acceptance",       example: "Bobby Nicholson" },
      { name: "total",         description: "Quote total (formatted)",        example: "R 12 500.00" },
      { name: "event_date",    description: "Formatted event date",           example: "5 May 2026" },
      { name: "guest_count",   description: "Guest count",                    example: "80" },
      { name: "quote_link",    description: "Link to the quote in admin",     example: "https://app.example.com/admin/quotes/..." },
      { name: "company_name",  description: "Catering company name",          example: "Spit Braai Delivery" },
    ],
  },

  // --- AFTER-SALES SEQUENCE (cron-fired post-event nurture) ---
  // Keys match templateType used by ensureScheduledAfterSales in
  // services/order/orderWorkflow.ts so a tenant override here lands
  // immediately on the next queued row.
  ...buildAfterSalesEntries(),

  // --- BILLING / SUBSCRIPTION (platform comms to the catering business) ---
  // Keys match the type passed to BillingEmailService.sendBillingEmail
  // so an override here drives the live send.
  {
    key: "subscription_started",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Subscription started",
    description: "Welcome email when a tenant first subscribes.",
    defaultSubject: "Welcome to CateringMS! Your subscription is active",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `Thank you for subscribing to our {{plan_name}} plan. Your subscription is now active and ready to use.\n\n` +
      `Plan: {{plan_name}}\n` +
      `Amount: {{amount}}\n` +
      `Billing cycle: {{billing_cycle}}\n` +
      `Next billing date: {{next_billing_date}}\n\n` +
      `Manage your subscription: {{subscription_url}}\n\n` +
      `Getting started:\n` +
      `1. Complete your profile setup\n` +
      `2. Add your first clients\n` +
      `3. Create your first quote\n` +
      `4. Set up your inventory\n\n` +
      `Need help? Reply here or email support@cateringms.com.\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "payment_succeeded",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Subscription payment received",
    description: "Payment receipt for a successful subscription charge.",
    defaultSubject: "Payment received - {{amount}}",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `We have successfully received your payment of {{amount}}.\n\n` +
      `Payment date: {{payment_date}}\n` +
      `Transaction ID: {{transaction_id}}\n` +
      `Billing period: {{billing_period_start}} to {{billing_period_end}}\n` +
      `Next billing date: {{next_billing_date}}\n\n` +
      `Invoice: {{invoice_url}}\n\n` +
      `Questions? billing@cateringms.com\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "payment_failed",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Subscription payment failed",
    description: "Sent when a subscription charge bounces.",
    defaultSubject: "Payment failed - action required",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `We attempted to process your payment but it failed.\n\n` +
      `Amount: {{amount}}\n` +
      `Attempted date: {{attempted_date}}\n` +
      `Reason: {{failure_reason}}\n\n` +
      `We will automatically retry in 3 days. To avoid any service interruption, please:\n` +
      `1. Check that your payment method is valid\n` +
      `2. Ensure sufficient funds are available\n` +
      `3. Update your payment details if needed\n\n` +
      `Update payment method: {{update_payment_url}}\n\n` +
      `Questions? billing@cateringms.com\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "trial_ending_soon",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Free trial ending",
    description: "Reminder a few days before the free trial expires.",
    defaultSubject: "Your free trial ends in {{days_remaining}} days",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `Your free trial of CateringMS will end on {{trial_end_date}} (in {{days_remaining}} days).\n\n` +
      `What you've accomplished:\n` +
      `- {{clients_created}} clients\n` +
      `- {{quotes_created}} quotes\n` +
      `- {{orders_created}} orders\n\n` +
      `To keep using CateringMS without interruption, please select a plan: {{pricing_url}}\n\n` +
      `If your trial ends without a plan selected, your account will be paused, and your data will be safely stored for 30 days.\n\n` +
      `Questions? support@cateringms.com\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "subscription_expiring",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Subscription renewing soon",
    description: "Reminder before the next billing cycle hits the card on file.",
    defaultSubject: "Your subscription renews in {{days_until_renewal}} days",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `Friendly reminder: your CateringMS subscription will automatically renew on {{renewal_date}}.\n\n` +
      `Plan: {{plan_name}}\n` +
      `Amount: {{amount}}\n` +
      `Renewal date: {{renewal_date}}\n` +
      `Payment method: {{payment_method}}\n\n` +
      `No action is required unless you want to make changes.\n\n` +
      `Manage subscription: {{subscription_url}}\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "price_change_notification",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Price change notification",
    description: "Sent ahead of a subscription price change.",
    defaultSubject: "Upcoming price change",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `We wanted to let you know about an upcoming change to our pricing.\n\n` +
      `Current price: {{current_price}}\n` +
      `New price: {{new_price}}\n` +
      `Effective date: {{effective_date}}\n` +
      `Reason: {{change_reason}}\n\n` +
      `{{explanation}}\n\n` +
      `Your options:\n` +
      `1. Continue: no action needed, new price applies from {{effective_date}}\n` +
      `2. Cancel: cancel without penalty before {{effective_date}}\n` +
      `3. Downgrade: switch to a different plan\n\n` +
      `You have 30 days to make any changes.\n\n` +
      `Manage subscription: {{subscription_url}}\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "subscription_cancelled",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Subscription cancelled",
    description: "Confirmation when the tenant cancels their subscription.",
    defaultSubject: "Subscription cancellation confirmed",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `We have processed your cancellation. We're sorry to see you go.\n\n` +
      `Plan: {{plan_name}}\n` +
      `Cancelled on: {{cancelled_date}}\n` +
      `Access until: {{access_until_date}}\n\n` +
      `You will continue to have access to all CateringMS features until {{access_until_date}}. Your data will be safely stored for 30 days after that.\n\n` +
      `If you change your mind, reactivate any time: {{reactivate_url}}\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "subscription_reactivated",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Subscription reactivated",
    description: "Welcome-back email after a reactivation.",
    defaultSubject: "Welcome back! Your subscription is reactivated",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `Great news: your subscription has been reactivated. We're excited to have you back.\n\n` +
      `Plan: {{plan_name}}\n` +
      `Amount: {{amount}}\n` +
      `Next billing date: {{next_billing_date}}\n\n` +
      `All your data has been preserved and is ready for you to pick up where you left off.\n\n` +
      `Go to dashboard: {{dashboard_url}}\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "staff_invitation",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Team member — account invitation",
    description: "Email a manager-invited team member receives to set up their portal account.",
    defaultSubject: "You're invited to join {{company_name}} on CateringMS",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `You have been invited by {{inviter_name}} to join {{company_name}} on the CateringMS platform as {{role}}.\n\n` +
      `To accept your invitation and set up your account, click the link below. The link expires in 7 days.\n\n` +
      `Accept invitation: {{join_url}}\n\n` +
      `If you have any questions, please contact your manager.\n\n` +
      `Welcome aboard,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
  {
    key: "account_deletion_scheduled",
    channel: "email",
    category: "staff",
    group: "Subscription",
    label: "Account deletion scheduled",
    description: "Sent when the tenant requests account deletion (30-day grace period).",
    defaultSubject: "Account deletion scheduled - 30 day grace period",
    defaultBody:
      `Hi {{user_name}},\n\n` +
      `We have received your request to delete your CateringMS account. Your account is scheduled for permanent deletion on {{deletion_date}}.\n\n` +
      `Important:\n` +
      `- You have 30 days to change your mind\n` +
      `- All your data will be permanently deleted\n` +
      `- This action cannot be undone after the deletion date\n` +
      `- Your subscription has been cancelled\n\n` +
      `Cancel this request any time before {{deletion_date}}: {{cancel_deletion_url}}\n\n` +
      `If you would like a data export, reply to this email.\n\n` +
      `Best regards,\nThe CateringMS Team`,
    variables: SUBSCRIPTION_VARS,
  },
];


// ── Delivery wiring ──────────────────────────────────────────────────
// LCF-Q (task #239, 2026-05-25): explicit catalogue of how each
// template actually leaves the system. Audited against the codebase:
//   - every templateType referenced by services / crons / webhooks
//     gets delivery=automated
//   - every key that's surfaced via a "Send" button on /admin/leads,
//     /admin/quotes or /admin/staff stays delivery=manual
//   - the editor reads these via the post-processor below so we
//     don't have to thread the fields onto every entry
//
// When adding a new template entry, you can set delivery + trigger +
// settingsLink directly on the entry, OR add a row here. The
// post-processor only fills in fields that aren't already on the
// entry, so per-entry overrides win.
const DELIVERY_WIRING: Record<string, { delivery: MessageDelivery; trigger?: string; settingsLink?: string }> = {
  // --- AUTOMATED: order lifecycle (services/order/orderWorkflow) ---
  order_confirmed:    { delivery: "automated", trigger: "Fires the moment an order moves to confirmed status." },
  order_preparing:    { delivery: "automated", trigger: "Fires when the kitchen marks prep as started." },
  order_ready:        { delivery: "automated", trigger: "Fires when the kitchen marks prep complete." },
  order_in_transit:   { delivery: "automated", trigger: "Fires the moment the driver leaves the kitchen." },
  order_delivered:    { delivery: "automated", trigger: "Fires the moment the driver marks delivery." },
  order_changed:           { delivery: "automated", trigger: "Fires the moment an order amendment is applied (admin approves a client change request OR edits the order directly)." },
  order_change_rejected:   { delivery: "automated", trigger: "Fires the moment an operator declines a client's change request." },

  // --- AUTOMATED: pre-event cron (ensureScheduledPreEventReminders) ---
  event_one_week_reminder:  { delivery: "automated", trigger: "Cron-scheduled 7 days before the event date." },
  event_day_before_reminder:{ delivery: "automated", trigger: "Cron-scheduled the day before the event." },
  waiter_assignment_email:  { delivery: "automated", trigger: "Fires when an admin assigns a waiter from the order Service team section.", settingsLink: "/admin/orders" },

  // --- AUTOMATED: after-sales nurture (ensureScheduledAfterSales) ---
  "aftersales_after-sales-1": { delivery: "automated", trigger: "Cron-fires 2 months after event completion." },
  "aftersales_after-sales-2": { delivery: "automated", trigger: "Cron-fires 4 months after event completion." },
  "aftersales_after-sales-3": { delivery: "automated", trigger: "Cron-fires 6 months after event completion." },
  "aftersales_after-sales-4": { delivery: "automated", trigger: "Cron-fires 8 months after event completion." },
  "aftersales_after-sales-5": { delivery: "automated", trigger: "Cron-fires 10 months after event completion." },
  "aftersales_after-sales-6": { delivery: "automated", trigger: "Cron-fires 12 months after event completion." },

  // --- AUTOMATED: money + reminders ---
  balance_reminder_email:        { delivery: "automated", trigger: "Cron fires when an outstanding balance is approaching its due date." },
  equipment_collection_reminder: { delivery: "automated", trigger: "Cron fires when hired equipment is still on site after the event." },

  // --- AUTOMATED: cancellation pipeline (services/email/cancellationEmails) ---
  cancellation_approved:  { delivery: "automated", trigger: "Fires the moment an order is cancelled." },
  refund_paid:            { delivery: "automated", trigger: "Fires the moment a refund EFT is marked paid." },
  postponement_approved:  { delivery: "automated", trigger: "Fires the moment a postponement is approved." },

  // --- AUTOMATED: invoice + payment receipt ---
  deposit_invoice_issued:   { delivery: "automated", trigger: "Fires the moment the deposit invoice is issued.", settingsLink: "/admin/invoices" },
  balance_invoice_issued:   { delivery: "automated", trigger: "Fires the moment the balance invoice is issued.", settingsLink: "/admin/invoices" },
  deposit_payment_received: { delivery: "automated", trigger: "Fires the moment a client deposit payment lands and the booking becomes secure.", settingsLink: "/admin/invoices" },
  balance_payment_received: { delivery: "automated", trigger: "Fires the moment a client balance or full payment lands on an invoice.", settingsLink: "/admin/invoices" },

  // --- AUTOMATED: quote acceptance ---
  quote_accepted_client:       { delivery: "automated", trigger: "Auto-reply the client receives the moment they accept a quote on the portal." },
  quote_accepted_admin_notify: { delivery: "automated", trigger: "Operator notification the moment a client accepts a quote on the portal." },

  // --- AUTOMATED: embed lead capture (lib/embed/notifyAdminOfEmbedLead) ---
  embed_lead_admin_email:    { delivery: "automated", trigger: "Fires the moment a website embed form lead is captured.", settingsLink: "/admin/integrations/embed" },
  embed_lead_admin_whatsapp: { delivery: "automated", trigger: "Fires the moment a website embed form lead is captured.", settingsLink: "/admin/integrations/embed" },
  embed_lead_thank_you_client:{ delivery: "automated", trigger: "Auto-reply the lead receives after submitting the website enquiry form.", settingsLink: "/admin/integrations/embed" },

  // --- AUTOMATED: account / portal ---
  client_magic_link:  { delivery: "automated", trigger: "Fires when a client requests their portal magic link." },
  owner_welcome:      { delivery: "automated", trigger: "Fires when a new tenant owner signs up." },
  staff_invite_login: { delivery: "automated", trigger: "Fires when a manager invites a new team member.", settingsLink: "/admin/users" },

  // --- AUTOMATED: subscription / billing (services/billingEmailService) ---
  subscription_started:        { delivery: "automated", trigger: "Platform fires when a tenant first subscribes." },
  payment_succeeded:           { delivery: "automated", trigger: "Platform fires after a successful subscription charge." },
  payment_failed:              { delivery: "automated", trigger: "Platform fires when a subscription charge fails." },
  trial_ending_soon:           { delivery: "automated", trigger: "Platform fires a few days before the free trial expires." },
  subscription_expiring:       { delivery: "automated", trigger: "Platform fires before the next billing cycle." },
  price_change_notification:   { delivery: "automated", trigger: "Platform fires ahead of a subscription price change." },
  subscription_cancelled:      { delivery: "automated", trigger: "Platform fires when a tenant cancels their subscription." },
  subscription_reactivated:    { delivery: "automated", trigger: "Platform fires on a subscription reactivation." },
  staff_invitation:            { delivery: "automated", trigger: "Platform fires when a manager invites a team member." },
  account_deletion_scheduled:  { delivery: "automated", trigger: "Platform fires the moment a tenant schedules account deletion." },

  // --- MANUAL: lead outreach (operator clicks Send on /admin/leads) ---
  email_lead_hot:        { delivery: "manual", trigger: "Click the Send button on a fresh enquiry in /admin/leads.", settingsLink: "/admin/leads" },
  email_lead_quoted:     { delivery: "manual", trigger: "Click Follow up on a quoted lead in /admin/leads.",        settingsLink: "/admin/leads" },
  email_lead_quiet:      { delivery: "manual", trigger: "Click Win-back on a quiet lead in /admin/leads.",          settingsLink: "/admin/leads" },
  email_lead_lost:       { delivery: "manual", trigger: "Click Door-open on a lost lead in /admin/leads.",          settingsLink: "/admin/leads" },
  email_lead_reply:      { delivery: "manual", trigger: "Click Reply on a fresh enquiry in /admin/leads.",          settingsLink: "/admin/leads" },
  email_lead_touch_base: { delivery: "manual", trigger: "Click Touch base on a warm lead in /admin/leads.",         settingsLink: "/admin/leads" },
  email_lead_follow_up:  { delivery: "manual", trigger: "Click Follow up on a quiet lead in /admin/leads.",          settingsLink: "/admin/leads" },
  email_lead_chase_quote:{ delivery: "manual", trigger: "Click Chase quote on a quoted lead in /admin/leads.",      settingsLink: "/admin/leads" },
  email_lead_winback:    { delivery: "manual", trigger: "Click Win-back on a lost lead in /admin/leads.",            settingsLink: "/admin/leads" },
  email_lead_reopen:     { delivery: "manual", trigger: "Click Reopen on a lost lead in /admin/leads.",              settingsLink: "/admin/leads" },

  // --- MANUAL: quote outreach (operator clicks Send / Follow up in /admin/quotes) ---
  email_quote_sent:     { delivery: "manual", trigger: "Click Send on a fresh quote in /admin/quotes.",     settingsLink: "/admin/quotes" },
  email_quote_revised:  { delivery: "manual", trigger: "Click Re-send after editing a quote.",              settingsLink: "/admin/quotes" },
  email_quote_accepted: { delivery: "manual", trigger: "Click Confirm next steps after a quote is accepted.", settingsLink: "/admin/quotes" },
  email_quote_expired:  { delivery: "manual", trigger: "Click Refresh on an expired quote in /admin/quotes.", settingsLink: "/admin/quotes" },
  email_quote_draft:    { delivery: "manual", trigger: "Click Notify on a draft quote in /admin/quotes.",   settingsLink: "/admin/quotes" },
  email_quote_rejected: { delivery: "manual", trigger: "Click Door-open on a rejected quote in /admin/quotes.", settingsLink: "/admin/quotes" },

  // --- MANUAL: client relationship outreach ---
  email_client_active:    { delivery: "manual", trigger: "Click Touch base on an active client in /admin/contacts.", settingsLink: "/admin/contacts" },
  email_client_returning: { delivery: "manual", trigger: "Click Touch base on a returning client in /admin/contacts.", settingsLink: "/admin/contacts" },
  email_client_vip:       { delivery: "manual", trigger: "Click Touch base on a VIP client in /admin/contacts.", settingsLink: "/admin/contacts" },
  email_client_cold:      { delivery: "manual", trigger: "Click Re-engage on a cold client in /admin/contacts.", settingsLink: "/admin/contacts" },
  email_client_won:       { delivery: "manual", trigger: "Click Check-in on a confirmed client in /admin/contacts.", settingsLink: "/admin/contacts" },

  // --- MANUAL: WhatsApp outreach (operator clicks Send on /admin/quotes / leads / staff) ---
  whatsapp_touch_base:       { delivery: "manual", trigger: "Click WhatsApp on a contact in /admin/contacts.",   settingsLink: "/admin/contacts" },
  whatsapp_lead_followup:    { delivery: "manual", trigger: "Click WhatsApp on a lead in /admin/leads.",          settingsLink: "/admin/leads" },
  whatsapp_quote_sent:       { delivery: "manual", trigger: "Click WhatsApp on a quote in /admin/quotes.",        settingsLink: "/admin/quotes" },
  whatsapp_quote_chase:      { delivery: "manual", trigger: "Click WhatsApp chase on a quote in /admin/quotes.", settingsLink: "/admin/quotes" },
  whatsapp_quote_accepted:   { delivery: "manual", trigger: "Click WhatsApp on an accepted quote.",              settingsLink: "/admin/quotes" },
  whatsapp_event_week:       { delivery: "manual", trigger: "Click WhatsApp on an upcoming event in /admin/orders.", settingsLink: "/admin/orders" },
  whatsapp_event_day_morning:{ delivery: "manual", trigger: "Click WhatsApp on an event-day order in /admin/orders.", settingsLink: "/admin/orders" },
  whatsapp_event_arrived:    { delivery: "manual", trigger: "Click On-site WhatsApp on a delivery in /admin/tracking.", settingsLink: "/admin/tracking" },
  whatsapp_delay_alert:      { delivery: "manual", trigger: "Click Running late WhatsApp on a delivery in /admin/tracking.", settingsLink: "/admin/tracking" },

  // --- MANUAL: staff WhatsApp ---
  whatsapp_staff_welcome_login:    { delivery: "manual", trigger: "Click WhatsApp welcome on a staff invite in /admin/users.", settingsLink: "/admin/users" },
  whatsapp_staff_welcome_no_login: { delivery: "manual", trigger: "Click WhatsApp welcome on a no-portal staff member.",        settingsLink: "/admin/users" },
  whatsapp_staff_shift_confirm:    { delivery: "manual", trigger: "Click Confirm shift on a staff member in /admin/staff.",    settingsLink: "/admin/staff" },
  whatsapp_staff_job_assigned:     { delivery: "manual", trigger: "Click Notify driver / kitchen on a job in /admin/dispatch.", settingsLink: "/admin/dispatch" },
  whatsapp_staff_pickup_ready:     { delivery: "manual", trigger: "Click WhatsApp driver when the kitchen marks pickup ready.", settingsLink: "/admin/dispatch" },
  whatsapp_staff_check_in:         { delivery: "manual", trigger: "Click Check-in on a staff member in /admin/staff.",          settingsLink: "/admin/staff" },
  whatsapp_staff_schedule_change:  { delivery: "manual", trigger: "Click Notify on a shift change in /admin/staff.",            settingsLink: "/admin/staff" },
};

// LCF-R (task #240): platform-owned templates. These are emails the
// platform (Skylight / CateringMS) sends to the tenant - subscription
// receipts, trial reminders, owner welcome, account-deletion notices.
// Hidden from the tenant editor because the tenant doesn't own the
// wording (the platform brand does). When a platform admin portal
// lands, these surface there with the same registry editor logic.
const PLATFORM_SCOPED_KEYS: ReadonlySet<string> = new Set([
  "owner_welcome",
  "subscription_started",
  "payment_succeeded",
  "payment_failed",
  "trial_ending_soon",
  "subscription_expiring",
  "price_change_notification",
  "subscription_cancelled",
  "subscription_reactivated",
  "account_deletion_scheduled",
  // NOTE: staff_invitation stays tenant-scoped because the tenant
  // manager is the one inviting their own team member - the body
  // mentions {{company_name}} so they can reasonably want to tweak
  // the welcome tone.
]);

// Apply the wiring once at module load. Per-entry fields win.
for (const t of TEMPLATE_REGISTRY) {
  const wiring = DELIVERY_WIRING[t.key];
  if (wiring) {
    if (t.delivery === undefined)     t.delivery = wiring.delivery;
    if (t.trigger === undefined)      t.trigger = wiring.trigger;
    if (t.settingsLink === undefined) t.settingsLink = wiring.settingsLink;
  }
  if (t.scope === undefined) {
    t.scope = PLATFORM_SCOPED_KEYS.has(t.key) ? "platform" : "tenant";
  }
}
// Anything not in the map defaults to "manual" with a generic trigger.
// Outreach templates outnumber automated ones, so manual is the safer
// fallback (an automated row with no firing wired up is a bug we want
// surfaced, a manual row with no specific button is just generic copy).
for (const t of TEMPLATE_REGISTRY) {
  if (t.delivery === undefined) t.delivery = "manual";
  if (t.trigger === undefined) {
    t.trigger = t.channel === "whatsapp"
      ? "Click the WhatsApp button on the matching workflow page."
      : "Click the Send button on the matching workflow page.";
  }
}

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
