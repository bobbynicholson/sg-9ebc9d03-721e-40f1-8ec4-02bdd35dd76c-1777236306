/**
 * Company-wide limits on automatic WhatsApp messages, so clients aren't
 * irritated. Stored in integrations.settings.rules.
 */
import { WHATSAPP_AUTOMATIONS, type WhatsAppAutomationKey } from "./automations";

export interface WhatsAppRules {
  /** Only message clients marked as agreed. Off by default. */
  requireConsent: boolean;
  quietStartHour: number;
  quietEndHour: number;
  /** Most automatic messages a person gets per week before booking. 0 = no limit. */
  weeklyLimit: number;
  leadChaseDays: number;
  eventDayHour: number;
}

export const DEFAULT_WHATSAPP_RULES: WhatsAppRules = {
  requireConsent: false,
  quietStartHour: 20,
  quietEndHour: 7,
  weeklyLimit: 2,
  leadChaseDays: 3,
  eventDayHour: 8,
};

/** These are about something happening right now, so they ignore quiet hours. */
const QUIET_HOUR_EXEMPT = new Set<WhatsAppAutomationKey>([
  "whatsapp_event_day_morning",
  "whatsapp_order_on_the_way",
  "whatsapp_event_arrived",
  "whatsapp_order_delivered",
  "whatsapp_staff_pickup_ready",
]);

/** Follow-ups stop once the person has replied. */
export const FOLLOW_UP_KEYS = new Set<WhatsAppAutomationKey>(["whatsapp_quote_chase", "whatsapp_lead_chase"]);

export const PRE_BOOKING_KEYS = new Set<WhatsAppAutomationKey>(
  WHATSAPP_AUTOMATIONS.filter((item) => item.group === "Enquiries" || item.group === "Quotes").map((item) => item.key),
);

export const CLIENT_KEYS = new Set<WhatsAppAutomationKey>(
  WHATSAPP_AUTOMATIONS.filter((item) => item.group !== "Staff").map((item) => item.key),
);

function wholeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

export function readWhatsAppRules(stored: unknown): WhatsAppRules {
  const saved = (stored && typeof stored === "object" ? (stored as { rules?: Partial<WhatsAppRules> }).rules : null) || {};
  const defaults = DEFAULT_WHATSAPP_RULES;
  return {
    requireConsent: saved.requireConsent === true,
    quietStartHour: wholeNumber(saved.quietStartHour, defaults.quietStartHour, 0, 23),
    quietEndHour: wholeNumber(saved.quietEndHour, defaults.quietEndHour, 0, 23),
    weeklyLimit: wholeNumber(saved.weeklyLimit, defaults.weeklyLimit, 0, 20),
    leadChaseDays: wholeNumber(saved.leadChaseDays, defaults.leadChaseDays, 1, 30),
    eventDayHour: wholeNumber(saved.eventDayHour, defaults.eventDayHour, 0, 23),
  };
}

/** Handles quiet hours that run past midnight, such as 20:00 to 07:00. */
export function isQuietHour(hour: number, rules: WhatsAppRules): boolean {
  const { quietStartHour: start, quietEndHour: end } = rules;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function sendsInQuietHours(key: WhatsAppAutomationKey): boolean {
  return QUIET_HOUR_EXEMPT.has(key);
}

const STOP_WORDS = new Set(["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "CANCEL"]);
const START_WORDS = new Set(["START", "SUBSCRIBE", "OPT IN", "OPTIN"]);

export function replyIntent(body: string | null | undefined): "stop" | "start" | null {
  const word = String(body || "").trim().toUpperCase().replace(/[.!]+$/, "");
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  return null;
}
