/**
 * The automatic emails a company can turn on ("Automatic") or off ("Off")
 * in Email settings, and the rule that decides which applies. Off = the
 * automatic email is not sent at all; admins can still send by hand.
 *
 * Shared by the Email settings screen and the sending code
 * (emailService gate, queue worker, automatedDelivery) so the screen
 * only ever lists emails the sending code actually controls.
 *
 * Rule: the email's own setting (template_delivery_modes[key]) wins;
 * otherwise the company-wide switch (queue_delivery_mode); otherwise
 * automatic.
 */
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";

export type EmailDeliveryMode = "automatic" | "off";

/** Stored values: "off" (current) and "manual_review" (earlier build) both mean off. */
function storedMode(value: unknown): EmailDeliveryMode | undefined {
  if (value === "automatic") return "automatic";
  if (value === "off" || value === "manual_review") return "off";
  return undefined;
}

export const QUEUE_DELIVERY_MODE_KEY = "queue_delivery_mode";
export const TEMPLATE_DELIVERY_MODES_KEY = "template_delivery_modes";

/**
 * Automatic emails that are not in the message template registry: the
 * scheduled (cron) jobs plus event emails sent under their own key.
 * Keys must match exactly what the sending code uses.
 */
export const SCHEDULED_EMAIL_TYPES = [
  ["email_lead_quoted", "Quote follow-up 1", "client", "Quote follow-up"],
  ["email_lead_quiet", "Quote follow-up 2", "client", "Quote follow-up"],
  ["email_lead_lost", "Quote follow-up 3", "client", "Quote follow-up"],
  ["deposit_reminder", "Deposit payment reminder", "client", "Money"],
  ["balance_reminder_email", "Balance payment reminder", "client", "Money"],
  ["review_request", "Review request", "client", "Post-event"],
  ["equipment_collection_reminder", "Equipment collection reminder", "client", "Post-event"],
  ["quote_expired_client", "Expired quote notice", "client", "Quote"],
  ["quote_expired_admin", "Expired quote alert", "staff", "Quote"],
  ["outsource_pre_event_reminder", "Outsource pre-event reminder", "staff", "Staff operations"],
  ["outsource_post_event_thanks", "Outsource post-event thanks", "staff", "Staff operations"],
  ["daily_summary", "Daily notification summary", "staff", "Account"],
  ["weekly_report", "Weekly notification report", "staff", "Account"],
  ["stale_shopping_list_digest", "Stale shopping list alert", "staff", "Staff operations"],
  ["invoices_overdue_admin_digest", "Overdue invoice digest", "staff", "Money"],
  ["quote_request_received", "Enquiry received — client auto-reply", "client", "Lead follow-up"],
  ["kitchen_pre_event_reminder", "Kitchen pre-event reminder — staff email", "staff", "Staff operations"],
  ["collection_en_route", "Equipment collection — driver on the way", "client", "Post-event"],
  ["collection_arrived", "Equipment collection — driver arrived", "client", "Post-event"],
  ["collection_complete", "Equipment collection — completed", "client", "Post-event"],
  ["payment_failed", "Payment failed — client notice", "client", "Money"],
  ["equipment_damage_charge", "Equipment damage charge — client email", "client", "Post-event"],
  ["order.created", "Booking confirmed — client email", "client", "Order lifecycle"],
  ["order_change_request_received", "Change request received — client reply", "client", "Order lifecycle"],
  ["cancellation_request_received", "Cancellation request received — client reply", "client", "Cancellation"],
  ["quote_declined_client", "Quote declined — client confirmation", "client", "Quote"],
  ["event_tomorrow_admin_email", "Event tomorrow — admin email", "staff", "Staff operations"],
  ["event_tomorrow_kitchen_email", "Event tomorrow — kitchen email", "staff", "Staff operations"],
  ["event_shopping_lead_email", "Event shopping list — shopping lead email", "staff", "Staff operations"],
] as const;

/**
 * In the template registry as automatic, but never sent by email (the
 * app only shows an in-app notification), so not listed.
 */
const NOT_EMAILED_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  "quote_accepted_client",
  "quote_accepted_admin_notify",
]);

/**
 * Always sent: sign-in links and team invitations (turning them off would
 * lock the person out) and the queued backup of a manual "Send quote".
 */
export const ALWAYS_IMMEDIATE_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  "client_magic_link",
  "staff_invite_login",
  "staff_invitation",
  // Queued backup of the admin's own "Send quote" (the composer can close
  // before it finishes). Part of a manual send, so never switched off.
  "quote.sent",
]);

export interface AutomatedEmailTemplate {
  key: string;
  label: string;
  category: string;
  group: string;
  /** False for sign-in / invitation emails that are always sent. */
  controllable: boolean;
}

export const AUTOMATED_EMAIL_TEMPLATES: AutomatedEmailTemplate[] = Array.from(
  new Map<string, AutomatedEmailTemplate>([
    ...TEMPLATE_REGISTRY
      .filter((t) => t.channel === "email" && t.delivery !== "manual" && t.scope !== "platform" && !NOT_EMAILED_TEMPLATE_KEYS.has(t.key))
      .map((t) => [t.key, {
        key: t.key,
        label: t.label,
        category: t.category,
        group: t.group,
        controllable: !ALWAYS_IMMEDIATE_TEMPLATE_KEYS.has(t.key),
      }] as const),
    ...SCHEDULED_EMAIL_TYPES.map(([key, label, category, group]) => [key, {
      key, label, category, group, controllable: true,
    }] as const),
  ]).values(),
);

const CONTROLLABLE_KEYS: ReadonlySet<string> = new Set(
  AUTOMATED_EMAIL_TEMPLATES.filter((t) => t.controllable).map((t) => t.key),
);

/** Whether the "Automatic / Off" setting applies to this email. */
export function isApprovalControllable(templateKey: string | null | undefined): boolean {
  return !!templateKey && CONTROLLABLE_KEYS.has(templateKey);
}

/** Company-wide switch. */
export function companyDeliveryMode(preferences: unknown): EmailDeliveryMode {
  const p = preferences && typeof preferences === "object" ? (preferences as Record<string, unknown>) : {};
  return storedMode(p[QUEUE_DELIVERY_MODE_KEY]) ?? "automatic";
}

/** The email's own setting, if it has one. */
export function templateDeliveryOverride(preferences: unknown, templateKey: string): EmailDeliveryMode | undefined {
  const p = preferences && typeof preferences === "object" ? (preferences as Record<string, unknown>) : {};
  const modes = p[TEMPLATE_DELIVERY_MODES_KEY];
  if (!modes || typeof modes !== "object") return undefined;
  return storedMode((modes as Record<string, unknown>)[templateKey]);
}

/**
 * Effective mode: the email's own setting, else the company switch.
 * Sign-in / invitation emails are always automatic. Callers outside the
 * queue only apply this to isApprovalControllable() emails.
 */
export function resolveEmailDeliveryMode(preferences: unknown, templateKey: string | null | undefined): EmailDeliveryMode {
  if (templateKey && ALWAYS_IMMEDIATE_TEMPLATE_KEYS.has(templateKey)) return "automatic";
  const own = templateKey ? templateDeliveryOverride(preferences, templateKey) : undefined;
  return own ?? companyDeliveryMode(preferences);
}
