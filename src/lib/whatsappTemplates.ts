/**
 * WhatsApp message templates -- the catalog the WhatsApp button picks
 * from. Two sets:
 *
 *   1. Client templates: lead follow-up, quote sent, quote chase,
 *      event-week reminder, day-of "we are on the way", delay alert.
 *      Used wherever the catering owner is messaging a client about a
 *      lead, quote or upcoming order. After-sales is intentionally
 *      excluded -- per Bobby that channel stays email-only.
 *
 *   2. Staff templates: shift confirm, job assigned, pickup ready,
 *      generic check-in. Used from the admin staff/driver pages.
 *
 * Tone is short, conversational, signed off with the operator's name.
 * WhatsApp readers expect 1-3 short sentences; templates that read
 * like emails feel wrong on the channel and get ignored.
 *
 * These mirror the structure of /lib/composeEmail.ts, so the two
 * channels stay intentionally aligned (client gets the same message
 * whether you reach them by email or WhatsApp).
 */

const fmtRand = (v?: number | null) =>
  v == null ? "" : `R${Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

const firstName = (name: string | null | undefined): string =>
  (name || "there").split(" ")[0];

// ── CLIENT-FACING ──────────────────────────────────────────────────

export type ClientWhatsAppKind =
  | "lead_followup"
  | "quote_sent"
  | "quote_chase"
  | "quote_accepted"
  | "event_week"
  | "event_day_morning"
  | "event_arrived"
  | "delay_alert";

export interface ClientWhatsAppContext {
  contactName: string;
  eventName?: string | null;
  eventDate?: string | null;
  guestCount?: number | null;
  total?: number | null;
  quoteRef?: string | null;
  driverName?: string | null;
  arrivalTime?: string | null;
  delayMinutes?: number | null;
  daysUntilEvent?: number | null;
  fromName?: string | null;
  companyName?: string | null;
}

export const CLIENT_WHATSAPP_LABELS: Record<ClientWhatsAppKind, string> = {
  lead_followup:     "Lead follow-up",
  quote_sent:        "Quote just sent",
  quote_chase:       "Quote chase",
  quote_accepted:    "Quote accepted, next steps",
  event_week:        "Event this week",
  event_day_morning: "Event day -- morning",
  event_arrived:     "We are on site",
  delay_alert:       "Running late",
};

/**
 * Render a client-facing WhatsApp template. Returns the message body
 * ready to be passed to openWhatsApp().
 */
export function renderClientWhatsApp(kind: ClientWhatsAppKind, ctx: ClientWhatsAppContext): string {
  const first = firstName(ctx.contactName);
  const sig = ctx.fromName || ctx.companyName || "";
  const sigLine = sig ? `\n\n-- ${sig}` : "";
  const eventLine = ctx.eventName
    ? ctx.eventDate ? `your ${ctx.eventName} on ${ctx.eventDate}` : `your ${ctx.eventName}`
    : ctx.eventDate ? `your event on ${ctx.eventDate}` : `your event`;
  const ref = ctx.quoteRef ? ` (ref ${ctx.quoteRef})` : "";
  const totalLine = ctx.total ? ` Sitting at ${fmtRand(ctx.total)} including VAT.` : "";

  switch (kind) {
    case "lead_followup":
      return `Hi ${first}, thanks for the enquiry about ${eventLine}. Quick check -- still on for the date? Happy to put a quote together as soon as I have final guest numbers.${sigLine}`;

    case "quote_sent":
      return `Hi ${first}, just sent the quote across for ${eventLine}${ref}.${totalLine} Have a look when you can and let me know if anything needs tweaking.${sigLine}`;

    case "quote_chase":
      return `Hi ${first}, circling back on the quote for ${eventLine}${ref}.${totalLine} Any thoughts? Happy to adjust the menu or the headcount if it helps.${sigLine}`;

    case "quote_accepted":
      return `Hi ${first}, thanks for confirming! Deposit invoice is on its way through. Final guest numbers + dietary info 7 days before the event keeps everything tight.${sigLine}`;

    case "event_week": {
      const d = ctx.daysUntilEvent;
      const when = d == null ? "this week" : d <= 1 ? "tomorrow" : `in ${d} days`;
      return `Hi ${first}, your event is ${when}. Confirming guest numbers and any dietary requirements now so we can lock the kitchen prep in.${sigLine}`;
    }

    case "event_day_morning": {
      const t = ctx.arrivalTime ? `Driver should be on site around ${ctx.arrivalTime}.` : "Driver is on the way.";
      return `Hi ${first}, all set for today. ${t} Reply to this message if anything changes on your side.${sigLine}`;
    }

    case "event_arrived": {
      const drv = ctx.driverName ? ` Your driver is ${ctx.driverName}.` : "";
      return `Hi ${first}, we are on site now.${drv} Anything you need, this thread is the fastest way to reach me.${sigLine}`;
    }

    case "delay_alert": {
      const mins = ctx.delayMinutes != null ? `${ctx.delayMinutes} min` : "a few minutes";
      return `Hi ${first}, quick heads-up -- running about ${mins} behind. Driver is on the way and I will message again as soon as we are pulling in.${sigLine}`;
    }
  }
}

// ── STAFF-FACING ───────────────────────────────────────────────────

export type StaffWhatsAppKind =
  | "shift_confirm"
  | "job_assigned"
  | "pickup_ready"
  | "general_check_in"
  | "schedule_change";

export interface StaffWhatsAppContext {
  staffName: string;
  /** "driver" | "kitchen" | "cleaning" | "shopping" -- pure UX hint. */
  role?: string;
  shiftDate?: string | null;
  shiftTime?: string | null;
  clientName?: string | null;
  eventName?: string | null;
  eventDate?: string | null;
  fromName?: string | null;
  companyName?: string | null;
}

export const STAFF_WHATSAPP_LABELS: Record<StaffWhatsAppKind, string> = {
  shift_confirm:    "Confirm shift",
  job_assigned:     "Job assigned",
  pickup_ready:     "Pickup ready",
  general_check_in: "Quick check-in",
  schedule_change:  "Schedule change",
};

export function renderStaffWhatsApp(kind: StaffWhatsAppKind, ctx: StaffWhatsAppContext): string {
  const first = firstName(ctx.staffName);
  const sig = ctx.fromName || ctx.companyName || "";
  const sigLine = sig ? `\n\n-- ${sig}` : "";
  const shift = ctx.shiftDate
    ? ctx.shiftTime ? `${ctx.shiftDate} (${ctx.shiftTime})` : ctx.shiftDate
    : "the shift";
  const clientLine = ctx.clientName
    ? ctx.eventDate ? `${ctx.clientName} on ${ctx.eventDate}` : ctx.clientName
    : "the order";

  switch (kind) {
    case "shift_confirm":
      return `Hi ${first}, can you confirm you are good for ${shift}? Reply YES to lock it in.${sigLine}`;

    case "job_assigned":
      return `Hi ${first}, you have been assigned to ${clientLine}. Open your team portal for the full details (route / prep list / pickup time).${sigLine}`;

    case "pickup_ready":
      return `Hi ${first}, the order for ${clientLine} is ready for pickup at the kitchen.${sigLine}`;

    case "general_check_in":
      return `Hi ${first}, quick check-in. All good for today? Shout if anything is off.${sigLine}`;

    case "schedule_change":
      return `Hi ${first}, heads-up -- there is a schedule change on your shift for ${shift}. Open your team portal for the latest version.${sigLine}`;
  }
}
