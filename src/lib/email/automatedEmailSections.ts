import { AUTOMATED_EMAIL_TEMPLATES, type AutomatedEmailTemplate } from "./automatedEmailTemplates";

const SECTION_DETAILS = [
  { id: "client", title: "Client & event emails", description: "Booking updates, event reminders, equipment collections and post-event follow-ups." },
  { id: "payments", title: "Payments & invoices", description: "Deposit and balance invoices, receipts, payment reminders, refunds and charges." },
  { id: "quotes", title: "Quotes & enquiries", description: "New enquiries, quote follow-ups and quote status alerts." },
  { id: "staff", title: "Staff & operations", description: "Team assignments, kitchen and shopping reminders, and outsource updates." },
  { id: "account", title: "Account access & reports", description: "Portal sign-in links, team invitations and notification summaries." },
] as const;

type SectionId = (typeof SECTION_DETAILS)[number]["id"];

function sectionFor(template: AutomatedEmailTemplate): SectionId {
  // Refunds and damage charges live under other lifecycle groups in the
  // sending registry, but belong with financial emails in settings.
  if (template.group === "Money" || template.group === "Invoice" ||
    template.key === "refund_paid" || template.key === "equipment_damage_charge") return "payments";
  if (["Quote", "Quote follow-up", "Lead alerts", "Lead follow-up"].includes(template.group)) return "quotes";
  if (!template.controllable || template.group === "Account" || template.group === "Subscription") return "account";
  return template.category === "staff" ? "staff" : "client";
}

/** Presentation only: every sending key and its saved delivery mode stay intact. */
export const AUTOMATED_EMAIL_SECTIONS = SECTION_DETAILS.map((section) => ({
  ...section,
  templates: AUTOMATED_EMAIL_TEMPLATES.filter((template) => sectionFor(template) === section.id),
}));

export const automatedEmailControlId = (key: string) => `automatic-email-${key}`;
export const automatedEmailCategoryId = (id: string) => `automatic-email-category-${id}`;
export const automatedEmailNavigationRef = (key: string) => `admin.email-settings.template.${key}`;

const EMAIL_ALIASES: Record<string, string[]> = {
  order_confirmed: ["order confirmation email"],
  "order.created": ["booking confirmation email"],
  order_preparing: ["kitchen preparation email", "preparation started email"],
  order_in_transit: ["delivery email", "on the way email"],
  order_delivered: ["delivery confirmation email", "order delivered email"],
  balance_reminder_email: ["balance reminder email", "balance payment reminder"],
  deposit_reminder: ["deposit reminder email", "deposit payment reminder"],
  deposit_payment_received: ["deposit receipt email", "deposit received email"],
  balance_payment_received: ["payment receipt email", "balance receipt email", "balance paid email"],
  event_one_week_reminder: ["event reminder email", "one week reminder", "week before reminder"],
  event_day_before_reminder: ["event reminder email", "one day reminder", "day before reminder"],
  review_request: ["review email", "review request email"],
  equipment_collection_reminder: ["equipment collection email", "collection reminder email"],
  email_lead_quoted: ["quote follow up 1", "first quote follow up"],
  email_lead_quiet: ["quote follow up 2", "second quote follow up"],
  email_lead_lost: ["quote follow up 3", "third quote follow up"],
  quote_price_updated: ["quote update email", "quote change email", "quote price update", "quote price increase email", "revised quote automatic email"],
};

export function automatedEmailKeywords(template: AutomatedEmailTemplate): string[] {
  return [template.label.toLowerCase(), template.label.split("—")[0].trim().toLowerCase(), ...(EMAIL_ALIASES[template.key] || [])];
}

const normalizeEmailQuery = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ")
  .replace(/\bemails\b/g, "email").replace(/\breminders\b/g, "reminder").replace(/\breceipts\b/g, "receipt")
  .replace(/\s+/g, " ").trim();

/** Prefer a named email's switch over a broad settings or document link. */
export function matchingAutomatedEmailControls(query: string): string[] {
  const normalized = normalizeEmailQuery(query);
  const emailContext = /\b(?:email|automatic|automation|turn off|turn on|disable|enable|stop sending)\b/.test(normalized)
    || (/\b(?:reminder|follow up)\b/.test(normalized) && /\b(?:change|where|open|stop)\b/.test(normalized));
  if (!emailContext) return [];
  return AUTOMATED_EMAIL_TEMPLATES.map((template) => ({
    key: template.key,
    score: Math.max(0, ...automatedEmailKeywords(template).map((phrase) => {
      const candidate = normalizeEmailQuery(phrase);
      return ` ${normalized} `.includes(` ${candidate} `) ? candidate.length : 0;
    })),
  })).filter((match) => match.score > 0).sort((left, right) => right.score - left.score)
    .map((match) => match.key);
}
