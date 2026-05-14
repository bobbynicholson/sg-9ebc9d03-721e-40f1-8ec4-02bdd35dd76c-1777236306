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
 *
 * Override flow:
 *   When a companyId is passed in the ctx, the renderer first checks
 *   for a saved per-company customisation (edited on
 *   /admin/messaging-templates) and silently falls back to the
 *   hardcoded default when no override exists. The cache must be
 *   prewarmed via the useTemplateOverrides hook for the override to
 *   land on the first render.
 */
import { resolveTemplateSync } from "@/services/messageTemplateService";

// Wave 24: tenant-aware money formatter, mirrors subjectFormatters.ts.
// Falls back to ZAR when no currency is passed so existing call sites
// render unchanged. WhatsApp messages don't have inbox-list density
// concerns so we use the full localised currency format (with locale-
// specific thousand separator + the right symbol).
const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA", USD: "en-US", GBP: "en-GB", EUR: "en-IE",
  AUD: "en-AU", NZD: "en-NZ", NGN: "en-NG", KES: "en-KE", CAD: "en-CA",
};
const fmtMoney = (v: number | null | undefined, code?: string | null): string => {
  if (v == null || !Number.isFinite(v)) return "";
  const c = (code || "ZAR").toUpperCase();
  const locale = CURRENCY_LOCALE[c] || "en-ZA";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${c} ${v.toFixed(0)}`;
  }
};

const firstName = (name: string | null | undefined): string =>
  (name || "there").split(" ")[0];

// ── CLIENT-FACING ──────────────────────────────────────────────────

export type ClientWhatsAppKind =
  | "touch_base"
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
  /** Tenant slug -- when present we append a short portal-login URL
   *  to client messages (cateringms.com/p/<slug>). The /p/[slug]
   *  redirect route exists specifically for WhatsApp so the URL is
   *  short enough not to dominate the message. */
  companySlug?: string | null;
  /** When set, the per-company customisation is consulted first.
   *  Cache must be prewarmed via the useTemplateOverrides hook. */
  companyId?: string | null;
  /** Wave 24: tenant currency code so the {total} interpolation
   *  renders in the right symbol for non-ZAR tenants. Defaults to
   *  ZAR for back-compat. */
  currencyCode?: string | null;
}

/** Build the public origin for portal links. Configurable via env so
 *  staging / preview deployments don't hand clients a prod URL. */
const PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN || "https://cateringms.com";

const portalLinkLine = (slug: string | null | undefined): string => {
  if (!slug) return "";
  return `\n\nQuick login: ${PUBLIC_ORIGIN}/p/${slug}`;
};

/** Map a client-facing kind to the matching registry override key. */
const CLIENT_KIND_TO_REGISTRY: Record<ClientWhatsAppKind, string> = {
  touch_base:        "whatsapp_touch_base",
  lead_followup:     "whatsapp_lead_followup",
  quote_sent:        "whatsapp_quote_sent",
  quote_chase:       "whatsapp_quote_chase",
  quote_accepted:    "whatsapp_quote_accepted",
  event_week:        "whatsapp_event_week",
  event_day_morning: "whatsapp_event_day_morning",
  event_arrived:     "whatsapp_event_arrived",
  delay_alert:       "whatsapp_delay_alert",
};

/** Build the registry context object from a ClientWhatsAppContext. */
function buildClientCtx(ctx: ClientWhatsAppContext): Record<string, string | number> {
  const first = (ctx.contactName || "there").split(" ")[0];
  return {
    first_name:   first,
    client_name:  ctx.contactName || "",
    company_name: ctx.companyName || "",
    from_name:    ctx.fromName || ctx.companyName || "",
    event_name:   ctx.eventName || "your event",
    event_date:   ctx.eventDate || "",
    guest_count:  ctx.guestCount ?? "",
    quote_ref:    ctx.quoteRef ? ` (ref ${ctx.quoteRef})` : "",
    total:        fmtMoney(ctx.total, ctx.currencyCode),
    portal_link:  ctx.companySlug ? `${PUBLIC_ORIGIN}/p/${ctx.companySlug}` : "",
    portal_line:  portalLinkLine(ctx.companySlug).trimStart(),
  };
}

export const CLIENT_WHATSAPP_LABELS: Record<ClientWhatsAppKind, string> = {
  touch_base:        "Touch base",
  lead_followup:     "Lead follow-up",
  quote_sent:        "Quote just sent",
  quote_chase:       "Quote chase",
  quote_accepted:    "Quote accepted, next steps",
  event_week:        "Event this week",
  event_day_morning: "Event day, morning",
  event_arrived:     "We are on site",
  delay_alert:       "Running late",
};

/**
 * Render a client-facing WhatsApp template. Returns the message body
 * ready to be passed to openWhatsApp().
 *
 * Order of operations:
 *   1. If a company override is saved for this kind, use it.
 *   2. Otherwise fall back to the hardcoded default below.
 *
 * Hardcoded defaults stay intact so existing UX never shifts for
 * tenants who haven't customised yet.
 */
export function renderClientWhatsApp(kind: ClientWhatsAppKind, ctx: ClientWhatsAppContext): string {
  // 1. Override path -- silent fallback to default when no customisation.
  const overrideKey = CLIENT_KIND_TO_REGISTRY[kind];
  if (overrideKey) {
    const resolved = resolveTemplateSync({
      companyId: ctx.companyId ?? null,
      key: overrideKey,
      ctx: buildClientCtx(ctx),
    });
    if (resolved && resolved.fromOverride) {
      return resolved.body;
    }
  }

  // 2. Hardcoded defaults (existing UX, unchanged).
  const first = firstName(ctx.contactName);
  const sig = ctx.fromName || ctx.companyName || "";
  const sigLine = sig ? `\n\n${sig}` : "";
  // Portal login URL line. Sits AFTER the signature so the quick-
  // login link is the last thing the client sees and is a single tap
  // to land in their portal. No-op if companySlug isn't passed.
  const portalLine = portalLinkLine(ctx.companySlug);
  const eventLine = ctx.eventName
    ? ctx.eventDate ? `your ${ctx.eventName} on ${ctx.eventDate}` : `your ${ctx.eventName}`
    : ctx.eventDate ? `your event on ${ctx.eventDate}` : `your event`;
  const ref = ctx.quoteRef ? ` (ref ${ctx.quoteRef})` : "";
  const totalLine = ctx.total ? ` Sitting at ${fmtMoney(ctx.total, ctx.currencyCode)} including VAT.` : "";

  switch (kind) {
    case "touch_base":
      return `Hi ${first}, hope you're well! Just touching base from ${ctx.companyName || "the team"}. Whenever you've got an event coming up, give me a shout and I'll put a quote together. No rush, just wanted to make sure you've got my number.${sigLine}${portalLine}`;

    case "lead_followup":
      return `Hi ${first}, thanks for the enquiry about ${eventLine}. Just checking that the date is still on. Happy to put a quote together as soon as I have final guest numbers.${sigLine}${portalLine}`;

    case "quote_sent":
      return `Hi ${first}, just sent the quote across for ${eventLine}${ref}.${totalLine} Have a look when you can and let me know if anything needs tweaking.${sigLine}${portalLine}`;

    case "quote_chase":
      return `Hi ${first}, circling back on the quote for ${eventLine}${ref}.${totalLine} Any thoughts? Happy to adjust the menu or the headcount if it helps.${sigLine}${portalLine}`;

    case "quote_accepted":
      return `Hi ${first}, thanks for confirming! Deposit invoice is on its way through. Final guest numbers + dietary info 7 days before the event keeps everything tight.${sigLine}${portalLine}`;

    case "event_week": {
      const d = ctx.daysUntilEvent;
      const when = d == null ? "this week" : d <= 1 ? "tomorrow" : `in ${d} days`;
      return `Hi ${first}, your event is ${when}. Confirming guest numbers and any dietary requirements now so we can lock the kitchen prep in.${sigLine}${portalLine}`;
    }

    case "event_day_morning": {
      const t = ctx.arrivalTime ? `Driver should be on site around ${ctx.arrivalTime}.` : "Driver is on the way.";
      return `Hi ${first}, all set for today. ${t} Reply to this message if anything changes on your side.${sigLine}${portalLine}`;
    }

    case "event_arrived": {
      const drv = ctx.driverName ? ` Your driver is ${ctx.driverName}.` : "";
      return `Hi ${first}, we are on site now.${drv} Anything you need, this thread is the fastest way to reach me.${sigLine}${portalLine}`;
    }

    case "delay_alert": {
      const mins = ctx.delayMinutes != null ? `${ctx.delayMinutes} min` : "a few minutes";
      return `Hi ${first}, quick heads up. Running about ${mins} behind. Driver is on the way and I will message again as soon as we are pulling in.${sigLine}${portalLine}`;
    }
  }
}

// ── STAFF-FACING ───────────────────────────────────────────────────

export type StaffWhatsAppKind =
  | "welcome_login"
  | "welcome_no_login"
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
  /** When set, the per-company customisation is consulted first. */
  companyId?: string | null;
}

const STAFF_KIND_TO_REGISTRY: Record<StaffWhatsAppKind, string> = {
  welcome_login:    "whatsapp_staff_welcome_login",
  welcome_no_login: "whatsapp_staff_welcome_no_login",
  shift_confirm:    "whatsapp_staff_shift_confirm",
  job_assigned:     "whatsapp_staff_job_assigned",
  pickup_ready:     "whatsapp_staff_pickup_ready",
  general_check_in: "whatsapp_staff_check_in",
  schedule_change: "whatsapp_staff_schedule_change",
};

function buildStaffCtx(ctx: StaffWhatsAppContext): Record<string, string | number> {
  const first = (ctx.staffName || "there").split(" ")[0];
  return {
    first_name:   first,
    staff_name:   ctx.staffName || "",
    company_name: ctx.companyName || "",
    from_name:    ctx.fromName || ctx.companyName || "",
    shift_date:   ctx.shiftDate || "the shift",
    shift_time:   ctx.shiftTime || "",
    client_name:  ctx.clientName || "the client",
    event_name:   ctx.eventName || "",
    event_date:   ctx.eventDate || "",
  };
}

export const STAFF_WHATSAPP_LABELS: Record<StaffWhatsAppKind, string> = {
  welcome_login:    "Welcome (portal login)",
  welcome_no_login: "Welcome (no login)",
  shift_confirm:    "Confirm shift",
  job_assigned:     "Job assigned",
  pickup_ready:     "Pickup ready",
  general_check_in: "Quick check-in",
  schedule_change:  "Schedule change",
};

export function renderStaffWhatsApp(kind: StaffWhatsAppKind, ctx: StaffWhatsAppContext): string {
  // 1. Override path -- silent fallback to default when no customisation.
  const overrideKey = STAFF_KIND_TO_REGISTRY[kind];
  if (overrideKey) {
    const resolved = resolveTemplateSync({
      companyId: ctx.companyId ?? null,
      key: overrideKey,
      ctx: buildStaffCtx(ctx),
    });
    if (resolved && resolved.fromOverride) {
      return resolved.body;
    }
  }

  // 2. Hardcoded defaults (existing UX, unchanged).
  const first = firstName(ctx.staffName);
  const sig = ctx.fromName || ctx.companyName || "";
  const sigLine = sig ? `\n\n${sig}` : "";
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
      return `Hi ${first}, heads up. There is a schedule change on your shift for ${shift}. Open your team portal for the latest version.${sigLine}`;
  }
}
